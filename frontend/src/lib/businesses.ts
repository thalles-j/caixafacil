import { ensureStoredAccessToken } from './auth';
import { observedFetch } from './observability';

const API_URL=import.meta.env.VITE_API_URL ?? '/api';
export type BusinessSummary={id:string;name:string;category:string;offering:'produtos'|'servicos'|'ambos';active:boolean;todayRevenue:number;monthRevenue:number};
export type BusinessesResponse={businesses:BusinessSummary[];maxBusinesses:number;consolidatedMonthRevenue:number};
export type ConsolidatedReport={start:string;end:string;businesses:Array<{id:string;name:string}>;totals:{sales:number;entries:number;outputs:number;tips:number;creditReceived:number;creditPending:number;fixedExpenses:number};statement:Array<{businessId:string;businessName:string;id:string;type:'entrada'|'saida';source:string;paymentMethod:string;amount:number;description?:string;entryKind?:string;expenseKind?:string;occurredAt:string}>};

async function request<T>(path:string,init:RequestInit={}):Promise<T>{
  const token=await ensureStoredAccessToken();
  const response=await observedFetch(`${API_URL}/businesses${path}`,{...init,credentials:'include',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...init.headers}});
  const body=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(body?.error ?? 'Não foi possível concluir a operação.');
  return body as T;
}
export const listBusinesses=()=>request<BusinessesResponse>('');
export const createBusiness=(input:{name:string;category:string;offering:string})=>request<{business:BusinessSummary}>('',{method:'POST',body:JSON.stringify(input)});
export const renameBusiness=(id:string,name:string)=>request<{id:string;name:string}>(`/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name})});
export const archiveBusiness=async(id:string,confirmation:string)=>{ await request(`/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({confirmation})}); };
export const consolidatedReport=(start:string,end:string,businessIds?:string[])=>request<ConsolidatedReport>(`/report?start=${start}&end=${end}${businessIds?.length?`&businessIds=${businessIds.join(',')}`:''}`);
