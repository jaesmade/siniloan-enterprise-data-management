"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle, IdentificationCard, SpinnerGap, X } from "@phosphor-icons/react";

import { createClient } from "@/lib/supabase/client";

type DatabaseKey = "jobseekers" | "research" | "biometrics";
type Department = { id: string; code: string; name: string };

const databaseNames: Record<DatabaseKey,string> = {
  jobseekers: "Jobseeker Registry", research: "Research & Data Requests", biometrics: "Biometrics Data",
};

const initialValues = { department_id:"", source_person_id:"", first_name:"", middle_name:"", surname:"", suffix:"", birth_date:"", sex:"", email:"", mobile_number:"", employment_status:"", preferred_occupation:"", requester_name:"", institution_office:"", research_title_purpose:"", category:"", control_number:"", date_received:"", status:"received", decision_notes:"", person_name:"", personnel_number:"", occurred_at:"", attendance_status:"", external_location_id:"", employment_id_number:"", workcode:"", verify_code:"", card_number:"" };

export function AddRecordModal({ database, onClose, onCreated }: { database: DatabaseKey; onClose: () => void; onCreated: (message: string) => void }) {
  const [values,setValues]=useState(initialValues);
  const [departments,setDepartments]=useState<Department[]>([]);
  const [loadingDepartments,setLoadingDepartments]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const dialogRef=useRef<HTMLElement>(null);
  const update=(field:keyof typeof initialValues,value:string)=>setValues(current=>({...current,[field]:value}));

  useEffect(()=>{
    let active=true;
    const supabase=createClient();
    const load=async()=>{
      const authResult=await supabase.auth.getUser();
      const departmentResult=await supabase.schema("core").from("departments").select("id, code, name").eq("is_active",true).order("name");
      const profileResult=authResult.data.user
        ? await supabase.schema("core").from("profiles").select("department_id").eq("id",authResult.data.user.id).maybeSingle()
        : {data:null,error:null};
      if(!active)return;
      if(departmentResult.error){setError("Departments could not be loaded.");}
      else {
        const next=(departmentResult.data??[]) as Department[];
        setDepartments(next);
        setValues(current=>({...current,department_id:profileResult.data?.department_id??next[0]?.id??""}));
      }
      setLoadingDepartments(false);
    };
    load().catch(()=>{if(active){setError("Departments could not be loaded.");setLoadingDepartments(false);}});
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    const previous=document.body.style.overflow; document.body.style.overflow="hidden";
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!saving){onClose();return;}
      if(event.key!=="Tab"||!dialogRef.current)return;
      const items=Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
      if(!items.length)return;
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keydown);
    return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown);};
  },[onClose,saving]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault(); setSaving(true); setError("");
    const payload={...values,occurred_at:values.occurred_at?new Date(values.occurred_at).toISOString():""};
    const {error:saveError}=await createClient().schema("core").rpc("create_manual_record",{p_module:database,p_data:payload});
    if(saveError){
      setError(saveError.code==="23505"?"A record with the same unique identifier already exists.":saveError.message);
      setSaving(false); return;
    }
    onCreated(`Record added to ${databaseNames[database]}.`);
  };

  return <div className="modal-backdrop record-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!saving)onClose()}}>
    <section ref={dialogRef} className="record-modal" role="dialog" aria-modal="true" aria-labelledby="add-record-title" aria-describedby="add-record-description">
      <header className="record-modal-header"><div className="record-modal-icon"><IdentificationCard weight="duotone"/></div><div><span className="eyebrow">Individual data entry</span><h2 id="add-record-title">Add to {databaseNames[database]}</h2><p id="add-record-description">Enter one record using the fields from this database&apos;s source form.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Close add record dialog"><X/></button></header>
      <form onSubmit={submit} className="record-modal-form">
        <div className="record-form-section"><div className="record-section-heading"><span>01</span><div><h3>Record ownership</h3><p>Choose the municipal department responsible for this record.</p></div></div><div className="record-form-grid"><label className="span-2">Department <b>*</b><select autoFocus value={values.department_id} onChange={e=>update("department_id",e.target.value)} required disabled={loadingDepartments}><option value="">{loadingDepartments?"Loading departments…":"Select department"}</option>{departments.map(item=><option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label></div></div>
        {database==="jobseekers"&&<JobseekerFields values={values} update={update}/>} 
        {database==="research"&&<ResearchFields values={values} update={update}/>} 
        {database==="biometrics"&&<BiometricFields values={values} update={update}/>} 
        {error&&<p className="form-error record-form-error" role="alert">{error}</p>}
        <footer className="record-modal-actions"><span><CheckCircle/> Required fields are marked with *</span><div><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button primary" disabled={saving||loadingDepartments}>{saving?<><SpinnerGap className="spin"/> Saving record…</>:"Add record"}</button></div></footer>
      </form>
    </section>
  </div>;
}

type FieldsProps={values:typeof initialValues;update:(field:keyof typeof initialValues,value:string)=>void};
function JobseekerFields({values,update}:FieldsProps){return <><div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Personal details</h3><p>Name and contact fields from the NSRP form.</p></div></div><div className="record-form-grid"><label>First name <b>*</b><input value={values.first_name} onChange={e=>update("first_name",e.target.value)} maxLength={120} required/></label><label>Middle name<input value={values.middle_name} onChange={e=>update("middle_name",e.target.value)} maxLength={120}/></label><label>Surname <b>*</b><input value={values.surname} onChange={e=>update("surname",e.target.value)} maxLength={120} required/></label><label>Suffix<input value={values.suffix} onChange={e=>update("suffix",e.target.value)} maxLength={30} placeholder="Jr., Sr., III"/></label><label>Date of birth<input type="date" value={values.birth_date} onChange={e=>update("birth_date",e.target.value)}/></label><label>Sex<select value={values.sex} onChange={e=>update("sex",e.target.value)}><option value="">Select</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label><label>Email address<input type="email" value={values.email} onChange={e=>update("email",e.target.value)} maxLength={254}/></label><label>Contact number<input value={values.mobile_number} onChange={e=>update("mobile_number",e.target.value)} maxLength={40}/></label></div></div><div className="record-form-section"><div className="record-section-heading"><span>03</span><div><h3>Employment preferences</h3><p>Current work status and preferred occupation.</p></div></div><div className="record-form-grid"><label>Employment status<select value={values.employment_status} onChange={e=>update("employment_status",e.target.value)}><option value="">Select status</option><option>Employed</option><option>Unemployed</option></select></label><label>Preferred occupation<input value={values.preferred_occupation} onChange={e=>update("preferred_occupation",e.target.value)} maxLength={200}/></label><label className="span-2">Source person ID<input value={values.source_person_id} onChange={e=>update("source_person_id",e.target.value)} maxLength={80} placeholder="Optional external identifier"/></label></div></div></>}
function ResearchFields({values,update}:FieldsProps){return <><div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Requester and purpose</h3><p>Identity, institution, and requested research use.</p></div></div><div className="record-form-grid"><label>Requester name <b>*</b><input value={values.requester_name} onChange={e=>update("requester_name",e.target.value)} maxLength={160} required/></label><label>School / institution / office<input value={values.institution_office} onChange={e=>update("institution_office",e.target.value)} maxLength={240}/></label><label className="span-2">Research title / purpose <b>*</b><textarea value={values.research_title_purpose} onChange={e=>update("research_title_purpose",e.target.value)} maxLength={1000} required/></label><label>Category<input value={values.category} onChange={e=>update("category",e.target.value)} maxLength={120}/></label><label>Control number<input value={values.control_number} onChange={e=>update("control_number",e.target.value)} maxLength={80}/></label></div></div><div className="record-form-section"><div className="record-section-heading"><span>03</span><div><h3>Request tracking</h3><p>Initial status and receipt information.</p></div></div><div className="record-form-grid"><label>Date received<input type="date" value={values.date_received} onChange={e=>update("date_received",e.target.value)}/></label><label>Status<select value={values.status} onChange={e=>update("status",e.target.value)}><option value="received">Received</option><option value="under_review">Under review</option><option value="needs_information">Needs information</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="released">Released</option><option value="closed">Closed</option></select></label><label className="span-2">Decision notes<textarea value={values.decision_notes} onChange={e=>update("decision_notes",e.target.value)} maxLength={1000}/></label></div></div></>}
function BiometricFields({values,update}:FieldsProps){return <><div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Personnel event</h3><p>Identity and attendance fields from the biometric device export.</p></div></div><div className="record-form-grid"><label>Name <b>*</b><input value={values.person_name} onChange={e=>update("person_name",e.target.value)} maxLength={160} required/></label><label>Personnel number <b>*</b><input value={values.personnel_number} onChange={e=>update("personnel_number",e.target.value)} maxLength={80} required/></label><label>Date / time <b>*</b><input type="datetime-local" value={values.occurred_at} onChange={e=>update("occurred_at",e.target.value)} required/></label><label>Attendance status<input value={values.attendance_status} onChange={e=>update("attendance_status",e.target.value)} maxLength={80} placeholder="Time in, Time out"/></label><label>Location ID<input value={values.external_location_id} onChange={e=>update("external_location_id",e.target.value)} maxLength={80}/></label><label>ID number<input value={values.employment_id_number} onChange={e=>update("employment_id_number",e.target.value)} maxLength={80}/></label></div></div><div className="record-form-section"><div className="record-section-heading"><span>03</span><div><h3>Device metadata</h3><p>Optional verification values recorded by the device.</p></div></div><div className="record-form-grid"><label>Workcode<input value={values.workcode} onChange={e=>update("workcode",e.target.value)} maxLength={80}/></label><label>Verify code<input value={values.verify_code} onChange={e=>update("verify_code",e.target.value)} maxLength={80}/></label><label className="span-2">Card number<input value={values.card_number} onChange={e=>update("card_number",e.target.value)} maxLength={100}/></label></div></div></>}
