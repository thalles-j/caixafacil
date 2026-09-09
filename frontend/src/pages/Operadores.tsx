import { useEffect, useState, type FormEvent } from 'react';
import { createOperator, listOperators, setOperatorActive, type Operator } from '../lib/operators';
import { PASSWORD_HINT } from '../lib/passwordPolicy';

export default function Operadores() {
  const [operators,setOperators]=useState<Operator[]>([]); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const load=async()=>{ try { setOperators((await listOperators()).operators); } catch(e){setError(e instanceof Error?e.message:'Falha ao carregar.');} };
  useEffect(()=>{ void listOperators().then(result => setOperators(result.operators))
    .catch(e => setError(e instanceof Error?e.message:'Falha ao carregar.')); },[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await createOperator({name,email,password});setName('');setEmail('');setPassword('');await load();}catch(x){setError(x instanceof Error?x.message:'Falha ao criar.');}finally{setBusy(false);}};
  const change=async(op:Operator)=>{setBusy(true);setError('');try{await setOperatorActive(op.id,!op.active);await load();}catch(x){setError(x instanceof Error?x.message:'Falha ao alterar.');}finally{setBusy(false);}};
  return <div className="space-y-6"><div><h2 className="font-display text-2xl font-bold text-ink">Operadores</h2><p className="text-sm text-ink-soft">Cada funcionário acessa com sua própria credencial e permissões de caixa.</p></div>
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-paper-raised p-4 sm:grid-cols-3">
      <input required maxLength={120} placeholder="Nome" value={name} onChange={e=>setName(e.target.value)} className="rounded-xl border border-line bg-paper p-3" />
      <input required type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} className="rounded-xl border border-line bg-paper p-3" />
      <input required type="password" placeholder="Senha inicial" title={PASSWORD_HINT} value={password} onChange={e=>setPassword(e.target.value)} className="rounded-xl border border-line bg-paper p-3" />
      <button disabled={busy} className="rounded-xl bg-ledger px-4 py-3 font-bold text-paper sm:col-span-3 disabled:opacity-50">Criar operador</button>
    </form>{error&&<p role="alert" className="text-sm text-stamp">{error}</p>}
    <ul className="divide-y divide-line rounded-2xl border border-line bg-paper-raised px-4">{operators.map(op=><li key={op.id} className="flex items-center justify-between gap-3 py-4"><div><p className="font-semibold text-ink">{op.name}</p><p className="text-xs text-ink-soft">{op.email}</p></div><button disabled={busy} onClick={()=>void change(op)} className={`rounded-lg px-3 py-2 text-xs font-bold ${op.active?'bg-stamp/10 text-stamp':'bg-ledger/10 text-ledger'}`}>{op.active?'Desativar':'Ativar'}</button></li>)}</ul>
  </div>;
}
