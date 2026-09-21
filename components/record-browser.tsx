"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Row = { id: string; [key: string]: unknown };
type Result = { rows: Row[]; total: number; page: number; statuses: string[] };
export function RecordBrowser({ database, columns, prepare, display }: {
  database: 'jobseekers' | 'research' | 'biometrics'; columns: Array<[string,string]>;
  prepare: (database: 'jobseekers' | 'research' | 'biometrics', rows: Row[]) => Row[];
  display: (value: unknown) => string;
}) {
  const [filters,setFilters]=useState({search:'',status:'',secondary:'',from:'',to:'',sort:'created_at',desc:true,page:1,size:25});
  const [result,setResult]=useState<Result|null>(null);
  const [loadedKey,setLoadedKey]=useState('');
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const key=JSON.stringify(filters);
  const invalid=Boolean(filters.from && filters.to && filters.from>filters.to);
  const busy=loadedKey!==key;
  const primary=database==='jobseekers'?'Employment status':database==='research'?'Request status':'Attendance status';
  const secondary=database==='jobseekers'?'Preferred occupation':database==='research'?'Category':'Location ID';
  function update(changes: Partial<typeof filters>) { setFilters(current=>({...current,...changes,page:1})); }
  useEffect(()=>{
    if(invalid)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try {
        const {data,error}=await createClient().schema('core').rpc('query_records',{
          p_module:database,p_search:filters.search,p_status:filters.status,p_secondary:filters.secondary,
          p_from:filters.from||null,p_to:filters.to||null,p_sort:filters.sort,p_desc:filters.desc,p_page:filters.page,p_size:filters.size,
        }).abortSignal(controller.signal);
        if(controller.signal.aborted)return;
        if(error)throw error;
        setResult(data as Result);setError('');setLoadedKey(key);
      } catch {
        if(!controller.signal.aborted){setError('Records could not be loaded. Please retry.');setLoadedKey(key);}
      }
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[database,filters,key,invalid,retry]);
  const page=result?.page??1;
  const total=result?.total??0;
  const pages=Math.max(1,Math.ceil(total/filters.size));
  return <section className="panel table-panel" aria-label="Database records">
    <div className="record-filter-grid">
      <label>Search records<input maxLength={200} value={filters.search} onChange={e=>update({search:e.target.value})} placeholder="Search all accessible records"/></label>
      <label>{primary}<select value={filters.status} onChange={e=>update({status:e.target.value})}><option value="">All statuses</option>{result?.statuses.map(status=><option key={status} value={status}>{display(status)}</option>)}</select></label>
      <label>{secondary}<input maxLength={200} value={filters.secondary} onChange={e=>update({secondary:e.target.value})}/></label>
      {database!=='jobseekers'&&<><label>{database==='research'?'Received from':'Event date from'}<input type="date" value={filters.from} onChange={e=>update({from:e.target.value})}/></label><label>Date to<input type="date" value={filters.to} onChange={e=>update({to:e.target.value})}/></label></>}
      <label>Sort by<select value={filters.sort} onChange={e=>update({sort:e.target.value})}><option value="created_at">Date added</option><option value="name">Name</option><option value="status">{primary}</option><option value="secondary">{secondary}</option>{database!=='jobseekers'&&<option value="record_date">{database==='research'?'Received date':'Event date'}</option>}</select></label>
      <label>Order<select value={String(filters.desc)} onChange={e=>update({desc:e.target.value==='true'})}><option value="false">Ascending</option><option value="true">Descending</option></select></label>
      <label>Rows per page<select value={filters.size} onChange={e=>update({size:Number(e.target.value)})}>{[25,50,100].map(size=><option key={size}>{size}</option>)}</select></label>
      <div className="record-filter-actions"><button className="button secondary" onClick={()=>update({search:'',status:'',secondary:'',from:'',to:''})}>Clear filters</button><span>Filters search all records you can access.</span></div>
    </div>
    {invalid?<p className="empty-state" role="alert">Date to must be on or after Date from.</p>:busy?<div className="empty-state" role="status">Loading records…</div>:error?<div className="empty-state" role="alert"><p>{error}</p><button className="button secondary" onClick={()=>{setLoadedKey('');setRetry(value=>value+1);}}>Retry</button></div>:<>
      {total===0?<div className="empty-state"><h2>No matching records</h2><p>Change or clear your filters to see more records.</p></div>:<div className="table-scroll"><table><thead><tr>{columns.map(([field,label])=><th key={field}>{label}</th>)}</tr></thead><tbody>{prepare(database,result?.rows??[]).map(row=><tr key={row.id}>{columns.map(([field])=><td key={field}>{display(row[field])}</td>)}</tr>)}</tbody></table></div>}
      <div className="pagination"><span role="status">{total===0?'0 matching records':`Showing ${((page-1)*filters.size+1).toLocaleString()}–${Math.min(page*filters.size,total).toLocaleString()} of ${total.toLocaleString()} matching records`}</span><div><button aria-label="First page" disabled={page<=1} onClick={()=>setFilters(current=>({...current,page:1}))}>«</button><button aria-label="Previous page" disabled={page<=1} onClick={()=>setFilters(current=>({...current,page:page-1}))}>‹</button><span>Page {page} of {pages}</span><button aria-label="Next page" disabled={page>=pages} onClick={()=>setFilters(current=>({...current,page:page+1}))}>›</button><button aria-label="Last page" disabled={page>=pages} onClick={()=>setFilters(current=>({...current,page:pages}))}>»</button></div></div>
    </>}
  </section>;
}
