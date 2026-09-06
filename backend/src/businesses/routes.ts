import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { authenticateAccessToken } from '../admin/authorization.js';
import { requireClient } from '../admin/requireAdmin.js';
import { requireTenantRole } from '../tenant/authorization.js';
import { MAX_BUSINESSES_PER_OWNER } from './config.js';

type AsyncRoute=(req:Request,res:Response,next:NextFunction)=>Promise<unknown>;
const asyncRoute=(handler:AsyncRoute)=>(req:Request,res:Response,next:NextFunction)=>{ void handler(req,res,next).catch(next); };
const OFFERINGS=new Set(['produtos','servicos','ambos']);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}

async function auditBusiness(client:import('pg').PoolClient,userId:string,businessId:string,action:string,details:Record<string,unknown>={}) {
  await client.query(`INSERT INTO admin_audit_logs
    (user_id,business_id,actor_id,actor_role,target_user_id,action,details)
    VALUES($1,$2,$1,'OWNER',$2,$3,$4::jsonb)`,[userId,businessId,action,JSON.stringify(details)]);
}

export const businessesRouter=Router();
businessesRouter.use(authenticateAccessToken,requireClient,requireTenantRole('OWNER'));

async function ownedBusinessIds(userId:string) {
  const result=await pool.query(`SELECT business_id FROM business_memberships
    WHERE user_id=$1 AND role='OWNER' AND active`,[userId]);
  return result.rows.map(row=>String(row.business_id));
}

businessesRouter.get('/',asyncRoute(async(_req,res)=>{
  const userId=res.locals.auth.sub;
  const result=await pool.query(`SELECT b.id,b.name,b.category,b.offering,b.archived_at,b.created_at,
    COALESCE(SUM(s.total_amount-s.returned_amount) FILTER(WHERE s.status='completed' AND
      (s.sold_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date),0) AS today_revenue,
    COALESCE(SUM(s.total_amount-s.returned_amount) FILTER(WHERE s.status='completed' AND
      date_trunc('month',s.sold_at AT TIME ZONE 'America/Sao_Paulo')=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')),0) AS month_revenue
    FROM business_memberships bm JOIN businesses b ON b.id=bm.business_id
    LEFT JOIN sales s ON s.business_id=b.id
    WHERE bm.user_id=$1 AND bm.role='OWNER' AND bm.active AND b.archived_at IS NULL
    GROUP BY b.id ORDER BY b.created_at,b.id`,[userId]);
  const businesses=result.rows.map(row=>({id:row.id,name:row.name,category:row.category,offering:row.offering,
    active:row.id===res.locals.auth.tenantId,todayRevenue:Number(row.today_revenue),monthRevenue:Number(row.month_revenue)}));
  return res.json({businesses,maxBusinesses:MAX_BUSINESSES_PER_OWNER,
    consolidatedMonthRevenue:businesses.reduce((sum,item)=>sum+item.monthRevenue,0)});
}));

businessesRouter.post('/',asyncRoute(async(req,res)=>{
  const userId=res.locals.auth.sub;
  const name=String(req.body?.name??'').trim();
  const category=String(req.body?.category??'').trim();
  const offering=String(req.body?.offering??'');
  if (!name || name.length>120 || !category || category.length>120 || !OFFERINGS.has(offering)) {
    return res.status(400).json({error:'Informe nome, tipo e atuação válidos para o negócio.'});
  }
  const id=crypto.randomUUID();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    const count=await client.query(`SELECT count(*)::int total FROM business_memberships
      WHERE user_id=$1 AND role='OWNER' AND active`,[userId]);
    if (Number(count.rows[0].total)>=MAX_BUSINESSES_PER_OWNER) {
      await client.query('ROLLBACK');
      return res.status(409).json({error:`Você pode administrar no máximo ${MAX_BUSINESSES_PER_OWNER} negócios.`});
    }
    await client.query('INSERT INTO businesses(id,owner_user_id,name,category,offering) VALUES($1,$2,$3,$4,$5)',[id,userId,name,category,offering]);
    await client.query(`INSERT INTO business_memberships(user_id,business_id,role) VALUES($1,$2,'OWNER')`,[userId,id]);
    await client.query(`INSERT INTO business_settings(user_id,business_id,business_name,business_category,offering,controls_stock,onboarding_completed)
      VALUES($1,$2,$3,$4,$5,$6,false)`,[userId,id,name,category,offering,offering!=='servicos']);
    await auditBusiness(client,userId,id,'business.created',{category,offering});
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK');
    if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='P0001') {
      return res.status(409).json({error:`Você pode administrar no máximo ${MAX_BUSINESSES_PER_OWNER} negócios.`});
    }
    throw error;
  } finally { client.release(); }
  return res.status(201).json({business:{id,name,category,offering,active:false,todayRevenue:0,monthRevenue:0}});
}));

businessesRouter.patch('/:id',asyncRoute(async(req,res)=>{
  const businessId=String(req.params.id);
  if(!UUID_RE.test(businessId)) return res.status(400).json({error:'Identificador do negócio inválido.'});
  const name=String(req.body?.name??'').trim();
  if (!name || name.length>120) return res.status(400).json({error:'Nome do negócio inválido.'});
  const userId=res.locals.auth.sub;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query(`UPDATE businesses b SET name=$3,updated_at=now() FROM business_memberships bm
      WHERE b.id=$2 AND bm.business_id=b.id AND bm.user_id=$1 AND bm.role='OWNER' AND bm.active AND b.archived_at IS NULL RETURNING b.id`,
      [userId,businessId,name]);
    if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Negócio não encontrado.'});}
    await client.query('UPDATE business_settings SET business_name=$2 WHERE business_id=$1',[businessId,name]);
    await auditBusiness(client,userId,businessId,'business.renamed',{fields:['name']});
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  return res.json({id:businessId,name});
}));

businessesRouter.delete('/:id',asyncRoute(async(req,res)=>{
  const businessId=String(req.params.id);
  if(!UUID_RE.test(businessId)) return res.status(400).json({error:'Identificador do negócio inválido.'});
  const confirmation=String(req.body?.confirmation??'');
  if (businessId===res.locals.auth.tenantId) return res.status(409).json({error:'Troque para outro negócio antes de arquivar o negócio ativo.'});
  const userId=res.locals.auth.sub;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    const owned=await client.query(`SELECT b.id,b.name FROM business_memberships bm JOIN businesses b ON b.id=bm.business_id
      WHERE bm.user_id=$1 AND bm.role='OWNER' AND bm.active AND b.archived_at IS NULL FOR UPDATE OF b,bm`,[userId]);
    const target=owned.rows.find(row=>row.id===businessId);
    if(!target){await client.query('ROLLBACK');return res.status(404).json({error:'Negócio não encontrado.'});}
    if(owned.rows.length<=1){await client.query('ROLLBACK');return res.status(409).json({error:'Sua conta precisa manter pelo menos um negócio ativo.'});}
    if(target.name!==confirmation){await client.query('ROLLBACK');return res.status(400).json({error:'Digite exatamente o nome do negócio para confirmar.'});}
    await auditBusiness(client,userId,businessId,'business.archived',{reason:'owner_confirmation'});
    await client.query('UPDATE businesses SET archived_at=now(),updated_at=now() WHERE id=$1',[businessId]);
    await client.query('UPDATE business_memberships SET active=false WHERE business_id=$1',[businessId]);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  return res.sendStatus(204);
}));

businessesRouter.get('/report',asyncRoute(async(req,res)=>{
  const start=String(req.query.start??'');
  const end=String(req.query.end??'');
  const rangeDays=(new Date(`${end}T00:00:00.000Z`).getTime()-new Date(`${start}T00:00:00.000Z`).getTime())/86_400_000;
  if (!validDate(start)||!validDate(end)||start>end||rangeDays>366) {
    return res.status(400).json({error:'Período inválido.'});
  }
  const allowed=await ownedBusinessIds(res.locals.auth.sub);
  const requested=typeof req.query.businessIds==='string' ? req.query.businessIds.split(',').filter(Boolean) : allowed;
  const ids=[...new Set(requested)];
  if(ids.some(id=>!UUID_RE.test(id))) return res.status(400).json({error:'Identificador de negócio inválido.'});
  if (!ids.length || ids.some(id=>!allowed.includes(id))) return res.status(403).json({error:'Um dos negócios selecionados não pertence a este login.'});
  const [businesses,transactions,sales,pending]=await Promise.all([
    pool.query('SELECT id,name FROM businesses WHERE id=ANY($1::uuid[]) AND archived_at IS NULL ORDER BY name',[ids]),
    pool.query(`SELECT t.business_id,b.name AS business_name,t.id,t.type,t.source,t.payment_method,t.amount,t.description,t.entry_kind,t.expense_kind,t.occurred_at
      FROM transactions t JOIN businesses b ON b.id=t.business_id WHERE t.business_id=ANY($1::uuid[])
      AND (t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date ORDER BY t.occurred_at,t.id`,[ids,start,end]),
    pool.query(`SELECT business_id,COALESCE(sum(total_amount-returned_amount),0) total FROM sales WHERE business_id=ANY($1::uuid[])
      AND status='completed' AND (sold_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY business_id`,[ids,start,end]),
    pool.query(`SELECT business_id,COALESCE(sum(amount-paid_amount-returned_amount),0) total FROM credit_sales
      WHERE business_id=ANY($1::uuid[]) AND status<>'pago' AND created_at < ($2::date+interval '1 day') GROUP BY business_id`,[ids,end]),
  ]);
  const statement=transactions.rows.map(row=>({businessId:row.business_id,businessName:row.business_name,id:row.id,type:row.type,
    source:row.source,paymentMethod:row.payment_method,amount:Number(row.amount),description:row.description,
    entryKind:row.entry_kind,expenseKind:row.expense_kind,occurredAt:new Date(row.occurred_at).toISOString()}));
  const totals={sales:sales.rows.reduce((n,r)=>n+Number(r.total),0),entries:0,outputs:0,tips:0,creditReceived:0,creditPending:pending.rows.reduce((n,r)=>n+Number(r.total),0),fixedExpenses:0};
  for (const item of statement) {
    if (item.type==='entrada') totals.entries+=item.amount; else totals.outputs+=item.amount;
    if (item.entryKind==='gorjeta') totals.tips+=item.amount;
    if (item.source==='pagamento_fiado') totals.creditReceived+=item.amount;
    if (item.source==='despesa_fixa') totals.fixedExpenses+=item.amount;
  }
  return res.json({start,end,businesses:businesses.rows,totals,statement});
}));
