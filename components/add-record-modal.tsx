"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCircle, IdentificationCard, SpinnerGap, X } from "@phosphor-icons/react";

import { createClient } from "@/lib/supabase/client";

type DatabaseKey = "jobseekers" | "research" | "biometrics";
type Department = { id: string; code: string; name: string };

const databaseNames: Record<DatabaseKey,string> = {
  jobseekers: "Jobseeker Registry", research: "Research & Data Requests", biometrics: "Biometrics Data",
};

const initialValues = { department_id:"", source_person_id:"", first_name:"", middle_name:"", surname:"", suffix:"", birth_date:"", sex:"", email:"", mobile_number:"", employment_status:"", highest_education:"", preferred_occupation:"", requester_name:"", institution_office:"", research_title_purpose:"", category:"", control_number:"", date_received:"", status:"received", decision_notes:"", person_name:"", personnel_number:"", occurred_at:"", attendance_status:"", external_location_id:"", employment_id_number:"", workcode:"", verify_code:"", card_number:"" };

export function AddRecordModal({ database, onClose, onCreated }: { database: DatabaseKey; onClose: () => void; onCreated: (message: string) => void }) {
  const [values,setValues]=useState(initialValues);
  const [jobseekerDetails,setJobseekerDetails]=useState<Record<string,string>>({});
  const [departments,setDepartments]=useState<Department[]>([]);
  const [loadingDepartments,setLoadingDepartments]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const dialogRef=useRef<HTMLElement>(null);
  const update=(field:keyof typeof initialValues,value:string)=>setValues(current=>({...current,[field]:value}));
  const updateJobseekerDetail=(field:string,value:string)=>setJobseekerDetails(current=>({...current,[field]:value}));

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
    const metadata:Record<string,string>=database==="jobseekers" ? Object.fromEntries(Object.entries(jobseekerDetails).filter(([,value])=>value.trim())) : {};
    const payload={...values,metadata,occurred_at:values.occurred_at?new Date(values.occurred_at).toISOString():""};
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
        {database==="jobseekers"&&<JobseekerFields values={values} update={update} details={jobseekerDetails} updateDetail={updateJobseekerDetail}/>}
        {database==="research"&&<ResearchFields values={values} update={update}/>}
        {database==="biometrics"&&<BiometricFields values={values} update={update}/>}
        {error&&<p className="form-error record-form-error" role="alert">{error}</p>}
        <footer className="record-modal-actions"><span><CheckCircle/> Required fields are marked with *</span><div><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button primary" disabled={saving||loadingDepartments}>{saving?<><SpinnerGap className="spin"/> Saving record…</>:"Add record"}</button></div></footer>
      </form>
    </section>
  </div>;
}

type FieldsProps={values:typeof initialValues;update:(field:keyof typeof initialValues,value:string)=>void};
type JobseekerFieldsProps=FieldsProps & {details:Record<string,string>;updateDetail:(field:string,value:string)=>void};
type DetailField={key:string;label:string;type?:"text"|"date"|"email"|"number";options?:string[];required?:boolean;wide?:boolean};

const select=(key:string,label:string,options:string[],required=false):DetailField=>({key,label,options,required});
const textField=(key:string,label:string,required=false,wide=false,type:DetailField["type"]="text"):DetailField=>({key,label,required,wide,type});

const personalDetails:DetailField[]=[
  select("CIVIL STATUS","Civil status",["Single","Married","Widowed"],true),
  select("RELIGION","Religion",["Roman Catholic","Iglesia ni Cristo (INC)","Islam (Muslim)","Seventh-day Adventist Church","Members Church of God International (MCGI)","Philippine Independent Church (Aglipayan)","Convention of the Philippine Baptist Churches","United Church of Christ in the Philippines (UCCP)","Jehovah's Witness","Evangelical Christianity","The Church of Jesus Christ of Latter-day Saints (Mormon)","Animism / Indigenous Folk Religions","Buddhism","Hinduism","Other Religion","None / Atheist"],true),
  select("HEIGHT (FT.)","Height",["4'1","4'2","4'3","4'4","4'5","4'6","4'7","4'8","4'9","4'10","4'11","5'0","5'1","5'2","5'3","5'4","5'5","5'6","5'7","5'8","5'9","5'10","5'11","6'0","6'1","6'2","6'3","6'4","6'5"]),
  textField("HOUSE NO./ STREET VILLAGE","House no. / street / village",true), textField("BARANGAY","Barangay",true), textField("MUNICIPALITY/ CITY","Municipality / city",true), textField("PROVINCE","Province",true), textField("TIN NUMBER","TIN number"),
  textField("DISABILITY","Disability",true,true),
];
const employmentDetails:DetailField[]=[
  select("EMPLOYEMENT TYPE","Employment type",["Wage-employed","Self-employed","Both"]), textField("IF SELF-EMPLOYED:","If self-employed, specify business"),
  select("HOW LONG HAVE YOU BEEN LOOKING FOR WORK?","How long have you been looking for work?",["Less than 1 month","1–3 months","4–6 months","7–12 months","More than 1 year","Not applicable"]),
  textField("REASON FOR UNEMPLOYEMENT","Reason for unemployment",false,true), select("ARE YOU A 4P's BENEFICIARY?","4Ps beneficiary?",["Yes","No"]), textField("IF YES, PLEASE PROVIDE HOUSEHOLD ID NO.","4Ps household ID"),
  select("ARE YOU AN OFW?","Are you an OFW?",["Yes","No"]), textField("SPECIFY COUNTRY","Current OFW country"), select("ARE YOU A FORMER OFW?","Are you a former OFW?",["Yes","No"]), textField("LATEST COUNTRY OF DEPLOYMENT","Latest country of deployment"), textField("MONTH AND YEAR OF RETURN TO PHILIPPINES","Month and year returned"),
];
const preferenceDetails:DetailField[]=[
  select("PREFERRED EMPLOYMENT TYPE","Preferred employment type",["Local","Overseas","Either"]), textField("PREFERRED WORK LOCATION","Preferred work location"), textField("PREFERRED CITY/ MUNICIPALITIES/ PROVINCE","Preferred city / municipality / province",false,true), textField("PREFERRED COUNTRIES","Preferred countries",false,true), textField("LANGUAGES","Languages / dialects",false,true), textField("OTHER LANGUAGE/DIALECT","Other language or dialect"), select("ARE YOU CURRENTLY ENROLLED IN SCHOOL?","Currently enrolled in school?",["Yes","No"]),
];
const educationDetails:DetailField[]=[
  textField("ELEMENTARY NAME OF SCHOOL","Elementary school"), textField("ELEMENTARY YEAR GRADUATED","Elementary year graduated",false,false,"number"), textField("SECONDARY NAME OF SCHOOL","Secondary school"), textField("SECONDARY YEAR GRADUATED","Secondary year graduated",false,false,"number"), textField("JUNIOR HIGH SCHOOL NAME OF SCHOOL","Junior high school"), textField("JUNIOR HIGH SCHOOL YEAR GRADUATED","Junior high year graduated",false,false,"number"), textField("SENIOR HIGH SCHOOL NAME OF SCHOOL","Senior high school"), textField("SENIOR HIGH STRAND","Senior high strand"), textField("SENIOR HIGH YEAR GRADUATED","Senior high year graduated",false,false,"number"), textField("TERTIARY NAME OF SCHOOL","Tertiary school"), textField("COURSE/PROGRAM","Course / program"), textField("TERTIARY YEAR GRADUATED","Tertiary year graduated",false,false,"number"),
];

function DetailSection({number,title,description,fields,details,updateDetail}:{number:string;title:string;description:string;fields:DetailField[];details:Record<string,string>;updateDetail:(field:string,value:string)=>void}){return <details className="record-form-section" open={number==="04"}><summary><span className="record-section-heading"><span>{number}</span><span><strong>{title}</strong><small>{description}</small></span></span></summary><div className="record-form-grid detail-grid">{fields.map(field=><label className={field.wide?"span-2":""} key={field.key}>{field.label}{field.required&&<b> *</b>}{field.options?<select value={details[field.key]??""} onChange={e=>updateDetail(field.key,e.target.value)} required={field.required}><option value="">Select</option>{field.options.map(option=><option key={option}>{option}</option>)}</select>:<input type={field.type??"text"} value={details[field.key]??""} onChange={e=>updateDetail(field.key,e.target.value)} required={field.required} maxLength={500}/>}</label>)}</div></details>}

function RepeatableSection({number,title,description,entryLabel,fields,count,details,updateDetail}:{number:string;title:string;description:string;entryLabel:string;fields:string[];count:number;details:Record<string,string>;updateDetail:(field:string,value:string)=>void}){return <details className="record-form-section"><summary><span className="record-section-heading"><span>{number}</span><span><strong>{title}</strong><small>{description}</small></span></span></summary>{Array.from({length:count},(_,index)=><fieldset className="repeatable-fields" key={index}><legend>{entryLabel} {index+1}</legend><div className="record-form-grid">{fields.map(field=>{const key=`${field} ${index+1}`;return <label key={key}>{field}<input value={details[key]??""} onChange={e=>updateDetail(key,e.target.value)} maxLength={500}/></label>})}</div></fieldset>)}</details>}

function JobseekerFields({values,update,details,updateDetail}:JobseekerFieldsProps){return <>
  <div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Personal details</h3><p>Required identity and contact information from NSRP Form 1.</p></div></div><div className="record-form-grid"><label>First name <b>*</b><input value={values.first_name} onChange={e=>update("first_name",e.target.value)} maxLength={120} required/></label><label>Middle name<input value={values.middle_name} onChange={e=>update("middle_name",e.target.value)} maxLength={120}/></label><label>Surname <b>*</b><input value={values.surname} onChange={e=>update("surname",e.target.value)} maxLength={120} required/></label><label>Suffix<input value={values.suffix} onChange={e=>update("suffix",e.target.value)} maxLength={30} placeholder="Jr., Sr., III"/></label><label>Date of birth <b>*</b><input type="date" value={values.birth_date} onChange={e=>update("birth_date",e.target.value)} required/></label><label>Gender <b>*</b><select value={values.sex} onChange={e=>update("sex",e.target.value)} required><option value="">Select</option><option>Female</option><option>Male</option><option>LGBTQIA+</option></select></label><label>Email address<input type="email" value={values.email} onChange={e=>update("email",e.target.value)} maxLength={254}/></label><label>Contact number <b>*</b><input value={values.mobile_number} onChange={e=>update("mobile_number",e.target.value)} maxLength={40} required/></label><label>Source person ID<input value={values.source_person_id} onChange={e=>update("source_person_id",e.target.value)} maxLength={80} placeholder="Optional external identifier"/></label></div></div>
  <DetailSection number="03" title="Address and profile" description="Personal profile, address, and disability information." fields={personalDetails} details={details} updateDetail={updateDetail}/>
  <div className="record-form-section"><div className="record-section-heading"><span>04</span><div><h3>Employment preferences</h3><p>These values feed the concise Records preview.</p></div></div><div className="record-form-grid"><label>Employment status <b>*</b><select value={values.employment_status} onChange={e=>update("employment_status",e.target.value)} required><option value="">Select status</option><option>Employed</option><option>Unemployed</option></select></label><label>Highest educational attainment<input value={values.highest_education} onChange={e=>update("highest_education",e.target.value)} maxLength={200}/></label><label className="span-2">Preferred occupation<input value={values.preferred_occupation} onChange={e=>update("preferred_occupation",e.target.value)} maxLength={200}/></label></div></div>
  <DetailSection number="05" title="Employment and household" description="Employment type, job search, 4Ps, and OFW history." fields={employmentDetails} details={details} updateDetail={updateDetail}/>
  <DetailSection number="06" title="Work preferences" description="Preferred employment, locations, countries, and languages." fields={preferenceDetails} details={details} updateDetail={updateDetail}/>
  <DetailSection number="07" title="Education" description="Schools, strands, programs, and graduation years." fields={educationDetails} details={details} updateDetail={updateDetail}/>
  <RepeatableSection number="08" title="Training" description="Record up to three technical or vocational trainings." entryLabel="Training" fields={["TRAINING/VOCATIONAL COURSE","HOURS OF TRAINING","TRAINING INSTITUTION","SKILLS ACQUIRED","CERTIFICATE RECEIVED"]} count={3} details={details} updateDetail={updateDetail}/>
  <RepeatableSection number="09" title="Civil service eligibility" description="Record civil-service eligibility entries and their examination dates." entryLabel="Eligibility" fields={["TYPE OF CIVIL SERVICE ELIGIBILITY?","DATE TAKEN"]} count={2} details={details} updateDetail={updateDetail}/>
  <RepeatableSection number="10" title="Professional licenses" description="Record up to four professional licenses and their expiry dates." entryLabel="License" fields={["PROFESSIONAL LICENSE","EXPIRY DATE/ VALID UNTIL"]} count={4} details={details} updateDetail={updateDetail}/>
  <RepeatableSection number="11" title="Work experience" description="Record up to five employers, positions, and employment periods." entryLabel="Work experience" fields={["COMPANY NAME","COMPANY ADDRESS (City/Municipality)","POSITION/ JOB TITLE","NUMBER OF MONTHS","STATUS"]} count={5} details={details} updateDetail={updateDetail}/>
  <DetailSection number="12" title="Skills" description="List all skills that apply to this jobseeker." fields={[textField("SELECT ALL SKILLS THAT APPLY","Skills",false,true)]} details={details} updateDetail={updateDetail}/>
</>}
function ResearchFields({values,update}:FieldsProps){return <><div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Requester and purpose</h3><p>Identity, institution, and requested research use.</p></div></div><div className="record-form-grid"><label>Requester name <b>*</b><input value={values.requester_name} onChange={e=>update("requester_name",e.target.value)} maxLength={160} required/></label><label>School / institution / office<input value={values.institution_office} onChange={e=>update("institution_office",e.target.value)} maxLength={240}/></label><label className="span-2">Research title / purpose <b>*</b><textarea value={values.research_title_purpose} onChange={e=>update("research_title_purpose",e.target.value)} maxLength={1000} required/></label><label>Category<input value={values.category} onChange={e=>update("category",e.target.value)} maxLength={120}/></label><label>Control number<input value={values.control_number} onChange={e=>update("control_number",e.target.value)} maxLength={80}/></label></div></div><div className="record-form-section"><div className="record-section-heading"><span>03</span><div><h3>Request tracking</h3><p>Initial status and receipt information.</p></div></div><div className="record-form-grid"><label>Date received<input type="date" value={values.date_received} onChange={e=>update("date_received",e.target.value)}/></label><label>Status<select value={values.status} onChange={e=>update("status",e.target.value)}><option value="received">Received</option><option value="under_review">Under review</option><option value="needs_information">Needs information</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="released">Released</option><option value="closed">Closed</option></select></label><label className="span-2">Decision notes<textarea value={values.decision_notes} onChange={e=>update("decision_notes",e.target.value)} maxLength={1000}/></label></div></div></>}
function BiometricFields({values,update}:FieldsProps){return <><div className="record-form-section"><div className="record-section-heading"><span>02</span><div><h3>Personnel event</h3><p>Identity and attendance fields from the biometric device export.</p></div></div><div className="record-form-grid"><label>Name <b>*</b><input value={values.person_name} onChange={e=>update("person_name",e.target.value)} maxLength={160} required/></label><label>Personnel number <b>*</b><input value={values.personnel_number} onChange={e=>update("personnel_number",e.target.value)} maxLength={80} required/></label><label>Date / time <b>*</b><input type="datetime-local" value={values.occurred_at} onChange={e=>update("occurred_at",e.target.value)} required/></label><label>Attendance status<input value={values.attendance_status} onChange={e=>update("attendance_status",e.target.value)} maxLength={80} placeholder="Time in, Time out"/></label><label>Location ID<input value={values.external_location_id} onChange={e=>update("external_location_id",e.target.value)} maxLength={80}/></label><label>ID number<input value={values.employment_id_number} onChange={e=>update("employment_id_number",e.target.value)} maxLength={80}/></label></div></div><div className="record-form-section"><div className="record-section-heading"><span>03</span><div><h3>Device metadata</h3><p>Optional verification values recorded by the device.</p></div></div><div className="record-form-grid"><label>Workcode<input value={values.workcode} onChange={e=>update("workcode",e.target.value)} maxLength={80}/></label><label>Verify code<input value={values.verify_code} onChange={e=>update("verify_code",e.target.value)} maxLength={80}/></label><label className="span-2">Card number<input value={values.card_number} onChange={e=>update("card_number",e.target.value)} maxLength={100}/></label></div></div></>}
