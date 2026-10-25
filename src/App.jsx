import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Activity, ArrowDownToLine, Bell, CalendarDays, ChartNoAxesCombined, Check,
  ChevronDown, CircleHelp, Crown, Database, ExternalLink, Gamepad2, Globe2,
  History, LogOut, Menu, Plus, RefreshCw, Search, Settings, Shield, Swords,
  Trash2, Trophy, Users, X, Zap
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const CLASSES = ["Demolisher","Sentinel","Berserker","Assassin","Ranger","Wizard","Warlock","Chanter","Cleric","Gunner","Launcher","MAU Pilot","Other"];
const FACTIONS = ["Bellato","Accretia","Cora","Other"];
const fmt = n => Number(n || 0).toLocaleString("en-US");
const dateText = v => v ? new Date(v).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "—";
const initials = s => (s || "?").slice(0,2).toUpperCase();

function App(){
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [memberships,setMemberships] = useState([]);
  const [guildId,setGuildId] = useState("");
  const [guild,setGuild] = useState(null);
  const [roster,setRoster] = useState([]);
  const [history,setHistory] = useState([]);
  const [events,setEvents] = useState([]);
  const [tab,setTab] = useState("overview");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [query,setQuery] = useState("");
  const [classFilter,setClassFilter] = useState("All classes");
  const [sort,setSort] = useState("power");
  const [showMember,setShowMember] = useState(false);
  const [editing,setEditing] = useState(null);
  const [showGuild,setShowGuild] = useState(false);
  const [showEvent,setShowEvent] = useState(false);
  const [showInvite,setShowInvite] = useState(false);
  const [showIntegration,setShowIntegration] = useState(false);
  const [memberForm,setMemberForm] = useState(blankMember());
  const [eventForm,setEventForm] = useState(blankEvent());
  const [guildForm,setGuildForm] = useState({name:"",server:"",region:"SEA"});
  const [inviteEmail,setInviteEmail] = useState("");
  const [inviteRole,setInviteRole] = useState("officer");
  const [discordWebhook,setDiscordWebhook] = useState("");
  const [discordChannel,setDiscordChannel] = useState("");
  const [mobileNav,setMobileNav] = useState(false);

  function blankMember(){return {ign:"",class_name:"Demolisher",faction:"Bellato",combat_power:"",notes:""}}
  function blankEvent(){return {title:"",event_type:"Guild event",starts_at:"",location:"",notes:""}}
  function flash(message){setNotice(message);window.setTimeout(()=>setNotice(""),3500)}

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,newSession)=>setSession(newSession));
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{if(session?.user) loadMemberships(); else {setProfile(null);setMemberships([]);setGuildId("");setGuild(null)}},[session?.user?.id]);
  useEffect(()=>{if(guildId) loadGuildData(guildId);},[guildId]);

  async function loadMemberships(){
    const {data:prof}=await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
    setProfile(prof);
    const {data,error}=await supabase.from("guild_memberships").select("id,role,guild_id,guilds(id,name,server,region,created_at)").eq("user_id",session.user.id);
    if(error){flash(error.message);return}
    const rows=data||[];setMemberships(rows);
    if(!guildId && rows.length) setGuildId(rows[0].guild_id);
  }
  async function loadGuildData(id){
    setBusy(true);
    const [g,m,h,e]=await Promise.all([
      supabase.from("guilds").select("*").eq("id",id).single(),
      supabase.from("roster_members").select("*").eq("guild_id",id).order("combat_power",{ascending:false}),
      supabase.from("cp_history").select("*,roster_members(ign)").eq("guild_id",id).order("recorded_at",{ascending:false}).limit(100),
      supabase.from("guild_events").select("*").eq("guild_id",id).order("starts_at",{ascending:true})
    ]);
    if(g.error) flash(g.error.message); else {setGuild(g.data);setGuildForm({name:g.data.name||"",server:g.data.server||"",region:g.data.region||"SEA"})}
    if(m.error) flash(m.error.message); else setRoster(m.data||[]);
    if(h.error) flash(h.error.message); else setHistory(h.data||[]);
    if(e.error) flash(e.error.message); else setEvents(e.data||[]);
    setBusy(false);
  }
  const membership=memberships.find(m=>m.guild_id===guildId);
  const isOfficer=["owner","admin","officer"].includes(membership?.role);
  const isOwner=["owner","admin"].includes(membership?.role);
  const totalCP=roster.reduce((a,m)=>a+Number(m.combat_power||0),0);
  const averageCP=roster.length?Math.round(totalCP/roster.length):0;
  const topPlayer=roster[0];
  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim();
    return [...roster].filter(m=>(classFilter==="All classes"||m.class_name===classFilter)&&(!q||[m.ign,m.class_name,m.faction,m.notes].some(x=>(x||"").toLowerCase().includes(q))))
      .sort((a,b)=>sort==="name"?a.ign.localeCompare(b.ign):sort==="low"?a.combat_power-b.combat_power:b.combat_power-a.combat_power);
  },[roster,query,classFilter,sort]);
  const distribution=useMemo(()=>CLASSES.map(c=>({name:c,count:roster.filter(m=>m.class_name===c).length})).filter(x=>x.count).sort((a,b)=>b.count-a.count),[roster]);
  const cpTimeline=useMemo(()=>{
    const map=new Map();
    [...history].reverse().forEach(h=>{const key=new Date(h.recorded_at).toLocaleDateString(undefined,{month:"short",day:"numeric"});map.set(key,(map.get(key)||0)+1)});
    return [...map.entries()].slice(-8);
  },[history]);

  async function signIn(e){
    e.preventDefault();const fd=new FormData(e.currentTarget);
    setBusy(true);
    const {error}=await supabase.auth.signInWithPassword({email:fd.get("email"),password:fd.get("password")});
    setBusy(false);if(error)flash(error.message);
  }
  async function signUp(e){
    e.preventDefault();const fd=new FormData(e.currentTarget);
    setBusy(true);
    const {error}=await supabase.auth.signUp({email:fd.get("email"),password:fd.get("password"),options:{data:{display_name:fd.get("name")}}});
    setBusy(false);if(error)flash(error.message);else flash("Account created. Check your email if confirmation is enabled.");
  }
  async function signOut(){await supabase.auth.signOut();setRoster([]);setMemberships([])}
  async function createGuild(e){
    e.preventDefault();if(!guildForm.name.trim())return;
    setBusy(true);
    const {data,error}=await supabase.rpc("create_guild",{guild_name:guildForm.name.trim(),guild_server:guildForm.server.trim()||null,guild_region:guildForm.region});
    setBusy(false);if(error){flash(error.message);return}
    await loadMemberships();setGuildId(data);setShowGuild(false);setTab("overview");flash("Guild created");
  }
  function editMember(m){setEditing(m);setMemberForm({ign:m.ign,class_name:m.class_name,faction:m.faction||"Other",combat_power:String(m.combat_power),notes:m.notes||""});setShowMember(true)}
  async function saveMember(e){
    e.preventDefault();if(!isOfficer)return;
    const cp=Math.max(0,Math.floor(Number(memberForm.combat_power)||0));
    const payload={guild_id:guildId,ign:memberForm.ign.trim(),class_name:memberForm.class_name,faction:memberForm.faction,combat_power:cp,notes:memberForm.notes.trim()||null,updated_at:new Date().toISOString()};
    if(!payload.ign){flash("IGN is required");return}
    setBusy(true);
    let result;
    if(editing) result=await supabase.from("roster_members").update(payload).eq("id",editing.id).select().single();
    else result=await supabase.from("roster_members").insert(payload).select().single();
    setBusy(false);
    if(result.error){flash(result.error.message);return}
    if(editing && Number(editing.combat_power)!==cp || !editing){
      const {error}=await supabase.from("cp_history").insert({guild_id:guildId,roster_member_id:result.data.id,combat_power:cp,recorded_by:session.user.id});
      if(error)flash("Member saved, but CP history could not be recorded: "+error.message);
    }
    setShowMember(false);setEditing(null);setMemberForm(blankMember());await loadGuildData(guildId);flash(editing?"Member updated":"Member added");
  }
  async function deleteMember(m){
    if(!isOfficer||!confirm(`Remove ${m.ign} from this guild roster?`))return;
    const {error}=await supabase.from("roster_members").delete().eq("id",m.id);
    if(error)flash(error.message);else {await loadGuildData(guildId);flash("Member removed")}
  }
  async function saveEvent(e){
    e.preventDefault();if(!isOfficer)return;
    const {error}=await supabase.from("guild_events").insert({guild_id:guildId,title:eventForm.title.trim(),event_type:eventForm.event_type,starts_at:new Date(eventForm.starts_at).toISOString(),location:eventForm.location.trim()||null,notes:eventForm.notes.trim()||null,created_by:session.user.id});
    if(error){flash(error.message);return}setShowEvent(false);setEventForm(blankEvent());await loadGuildData(guildId);flash("Event created");
  }
  async function deleteEvent(ev){
    if(!isOfficer||!confirm(`Delete event "${ev.title}"?`))return;
    const {error}=await supabase.from("guild_events").delete().eq("id",ev.id);
    if(error)flash(error.message);else{await loadGuildData(guildId);flash("Event deleted")}
  }
  async function saveGuildSettings(e){
    e.preventDefault();if(!isOwner)return;
    const {error}=await supabase.from("guilds").update({name:guildForm.name.trim(),server:guildForm.server.trim()||null,region:guildForm.region}).eq("id",guildId);
    if(error){flash(error.message);return}await loadMemberships();await loadGuildData(guildId);flash("Guild settings saved");
  }
  async function inviteOfficer(e){
    e.preventDefault();if(!isOwner)return;
    const email=inviteEmail.trim().toLowerCase();
    const {data:prof,error}=await supabase.from("profiles").select("id,email").eq("email",email).maybeSingle();
    if(error||!prof){flash("That user must create a GuildCore account first.");return}
    const {error:insertError}=await supabase.from("guild_memberships").insert({guild_id:guildId,user_id:prof.id,role:inviteRole});
    if(insertError)flash(insertError.message);else{setShowInvite(false);setInviteEmail("");await loadMemberships();flash("Guild access granted")}
  }
  async function saveDiscord(e){
    e.preventDefault();if(!isOwner)return;
    const {error:deleteError}=await supabase.from("guild_integrations").delete().eq("guild_id",guildId);
    if(deleteError){flash(deleteError.message);return}
    const {error}=await supabase.from("guild_integrations").insert({guild_id:guildId,discord_webhook_url:discordWebhook.trim(),channel_label:discordChannel.trim()||null,updated_at:new Date().toISOString()});
    if(error){flash(error.message);return}setShowIntegration(false);setDiscordWebhook("");setDiscordChannel("");flash("Discord integration saved");
  }
  async function sendDiscordTest(){
    const {data,error}=await supabase.functions.invoke("discord-notify",{body:{guild_id:guildId,message:`**${guild.name}** GuildCore integration test — connection successful.`}});
    if(error)flash("Discord test failed: "+error.message);else if(data?.error)flash(data.error);else flash("Test announcement sent to Discord");
  }
  function exportCSV(){
    const rows=[["IGN","Class","Faction","Combat Power","Notes"],...roster.map(m=>[m.ign,m.class_name,m.faction,m.combat_power,m.notes||""])];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${(guild?.name||"guild").replace(/[^a-z0-9-_]/gi,"_")}-roster.csv`;a.click();URL.revokeObjectURL(url);
  }
  function renderAuth(){
    const [mode,setMode]=[window.__authMode||"signin",v=>{window.__authMode=v;setTab("auth") }]; // small local mode toggle
    return <div className="auth-screen"><div className="auth-card"><Brand/><div className="eyebrow">Guild command network</div><h1>{mode==="signup"?"Create your account":"Welcome back, commander"}</h1><p className="muted">Sign in to access your guild's shared RF Online NEXT roster.</p>
      <form className="stack" onSubmit={mode==="signup"?signUp:signIn}>
        {mode==="signup"&&<label>Display name<input name="name" className="input" placeholder="Your name" required/></label>}
        <label>Email<input name="email" className="input" type="email" placeholder="you@example.com" required/></label>
        <label>Password<input name="password" className="input" type="password" minLength="8" placeholder="At least 8 characters" required/></label>
        <button className="btn primary wide" disabled={busy}>{busy?"Please wait…":mode==="signup"?"Create account":"Sign in"} <Shield size={16}/></button>
      </form><button className="link-button" onClick={()=>set("signup")}>{mode==="signup"?"Already have an account? Sign in":"New to GuildCore? Create an account"}</button>
      <p className="tiny muted">Online mode requires a configured Supabase project. See README.md for setup.</p>
    </div></div>
  }

  if(!supabase) return <div className="setup-screen"><div className="auth-card"><Brand/><div className="eyebrow">Configuration needed</div><h1>Connect your guild network</h1><p className="muted">Add your Supabase project URL and anon key to a <code>.env</code> file, then restart the app. The README walks you through creating the database and deploying it.</p><div className="setup-list"><div><Check/> Create a Supabase project</div><div><Check/> Run the database migration SQL</div><div><Check/> Configure <code>.env</code></div><div><Check/> Deploy the Discord Edge Function (optional)</div></div><p className="tiny muted">No secret service-role keys belong in frontend environment variables.</p></div></div>;
  if(!session) return <>{renderAuth()}{notice&&<div className="toast">{notice}</div>}</>;
  const navItems=[["overview","Overview",Activity],["roster","Roster",Users],["rankings","Rankings",Trophy],["history","CP history",History],["events","Events",CalendarDays],["settings","Guild settings",Settings]];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?"open":""}`}><Brand/><div className="guild-picker"><span className="overline">Active guild</span><select value={guildId} onChange={e=>{setGuildId(e.target.value);setMobileNav(false)}} className="input">{memberships.map(m=><option key={m.guild_id} value={m.guild_id}>{m.guilds?.name} · {m.role}</option>)}</select><button className="btn subtle small wide" onClick={()=>{setGuildForm({name:"",server:"",region:"SEA"});setShowGuild(true)}}><Plus size={14}/> Create guild</button></div>
      <div className="nav-label">Command</div><nav>{navItems.map(([id,label,Icon])=><button key={id} className={`nav-item ${tab===id?"active":""}`} onClick={()=>{setTab(id);setMobileNav(false)}}><Icon size={17}/><span>{label}</span>{id==="events"&&events.length>0&&<b className="nav-count">{events.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">{initials(profile?.display_name||session.user.email)}</div><div className="user-info"><b>{profile?.display_name||session.user.email.split("@")[0]}</b><span>{membership?.role||"member"}</span></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div><div className="online"><span className="online-dot"/> Secure guild workspace</div></div>
    </aside>
    {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button><div><div className="crumb">RF ONLINE NEXT <span>/</span> {guild?.name||"GUILD"}</div><div className="page-title">{navItems.find(x=>x[0]===tab)?.[1]||"Overview"}</div></div><div className="top-actions"><span className="server-chip"><span className="online-dot"/>{guild?.server||guild?.region||"SEA server"}</span><button className="btn icon-only" title="Refresh data" onClick={()=>loadGuildData(guildId)}><RefreshCw size={16}/></button><button className="btn primary" onClick={()=>{setEditing(null);setMemberForm(blankMember());setShowMember(true)}} disabled={!isOfficer}><Plus size={16}/> Add member</button></div></header>
      {!guildId?<section className="empty-panel"><Gamepad2 size={34}/><h2>Choose or create a guild</h2><p>Create a guild workspace or ask a guild owner to add your account.</p><button className="btn primary" onClick={()=>setShowGuild(true)}><Plus size={16}/> Create guild</button></section>:<>
      {tab==="overview"&&<Overview guild={guild} roster={roster} totalCP={totalCP} averageCP={averageCP} topPlayer={topPlayer} events={events} distribution={distribution} cpTimeline={cpTimeline} setTab={setTab} isOfficer={isOfficer} setShowEvent={setShowEvent}/>}
      {tab==="roster"&&<section className="panel"><PanelHeader icon={Users} title="Guild roster" subtitle={`${roster.length} tracked characters`} right={<button className="btn" onClick={exportCSV}><ArrowDownToLine size={15}/> Export CSV</button>}/><div className="toolbar"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search IGN, class, faction…"/></div><select className="input compact" value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option>All classes</option>{CLASSES.map(c=><option key={c}>{c}</option>)}</select><select className="input compact" value={sort} onChange={e=>setSort(e.target.value)}><option value="power">Highest CP</option><option value="low">Lowest CP</option><option value="name">IGN A–Z</option></select></div><RosterTable roster={filtered} isOfficer={isOfficer} editMember={editMember} deleteMember={deleteMember}/></section>}
      {tab==="rankings"&&<section className="panel"><PanelHeader icon={Trophy} title="Combat power leaderboard" subtitle="Guild strength, ranked by current Combat Power"/><div className="leaderboard">{roster.map((m,i)=><div className={`leader-row ${i<3?"podium":""}`} key={m.id}><div className={`rank-number rank-${i+1}`}>{i===0?<Crown size={17}/>:String(i+1).padStart(2,"0")}</div><div className="avatar">{initials(m.ign)}</div><div className="leader-person"><b>{m.ign}</b><span>{m.class_name} · {m.faction}</span></div><div className="leader-meter"><div className="bar"><span style={{width:`${topPlayer?Math.max(2,m.combat_power/topPlayer.combat_power*100):0}%`}}/></div></div><div className="leader-cp">{fmt(m.combat_power)} <small>CP</small></div></div>)}{!roster.length&&<Empty title="No rankings yet" text="Add guild members to generate the leaderboard."/>}</div></section>}
      {tab==="history"&&<section className="panel"><PanelHeader icon={History} title="Combat power history" subtitle="Recorded CP changes across your guild"/><div className="history-summary"><div><span className="overline">Total records</span><strong>{history.length}</strong></div><div><span className="overline">Latest update</span><strong>{history[0]?dateText(history[0].recorded_at):"—"}</strong></div><div><span className="overline">Tracked players</span><strong>{new Set(history.map(h=>h.roster_member_id)).size}</strong></div></div><div className="history-list">{history.map(h=><div className="history-item" key={h.id}><div className="history-icon"><Zap size={15}/></div><div className="history-detail"><b>{h.roster_members?.ign||"Roster member"}</b><span>{dateText(h.recorded_at)} · CP recorded</span></div><strong>{fmt(h.combat_power)} <small>CP</small></strong></div>)}{!history.length&&<Empty title="No CP history recorded" text="Add a new member or update a member's CP to create a history record."/>}</div></section>}
      {tab==="events"&&<section className="panel"><PanelHeader icon={CalendarDays} title="Guild events" subtitle="Coordinate wars, PvP, raids and guild activities" right={isOfficer&&<button className="btn primary" onClick={()=>setShowEvent(true)}><Plus size={15}/> New event</button>}/><div className="event-grid">{events.map(ev=><div className="event-card" key={ev.id}><div className="event-date"><b>{new Date(ev.starts_at).toLocaleDateString(undefined,{day:"2-digit"})}</b><span>{new Date(ev.starts_at).toLocaleDateString(undefined,{month:"short"})}</span></div><div className="event-info"><span className="event-type">{ev.event_type}</span><h3>{ev.title}</h3><p>{new Date(ev.starts_at).toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}{ev.location?` · ${ev.location}`:""}</p>{ev.notes&&<p className="muted">{ev.notes}</p>}</div>{isOfficer&&<button className="icon-btn" onClick={()=>deleteEvent(ev)} title="Delete event"><Trash2 size={15}/></button>}</div>)}{!events.length&&<Empty title="No upcoming events" text="Create an event to coordinate your guild's next activity."/>}</div></section>}
      {tab==="settings"&&<div className="settings-grid"><section className="panel"><PanelHeader icon={Settings} title="Guild profile" subtitle="Update your guild workspace details"/><form className="settings-form" onSubmit={saveGuildSettings}><label>Guild name<input className="input" value={guildForm.name} onChange={e=>setGuildForm({...guildForm,name:e.target.value})} required disabled={!isOwner}/></label><label>Server / shard<input className="input" value={guildForm.server} onChange={e=>setGuildForm({...guildForm,server:e.target.value})} placeholder="e.g. Nexus 01" disabled={!isOwner}/></label><label>Region<select className="input" value={guildForm.region} onChange={e=>setGuildForm({...guildForm,region:e.target.value})} disabled={!isOwner}><option>SEA</option><option>KR</option><option>Global</option><option>Other</option></select></label>{isOwner&&<button className="btn primary">Save guild profile</button>}</form></section><section className="panel"><PanelHeader icon={Shield} title="Officer access" subtitle="Manage who can edit this guild"/><div className="settings-form"><p className="muted">Only owners and admins can grant access. The user must have created a GuildCore account first.</p>{isOwner&&<button className="btn" onClick={()=>setShowInvite(true)}><Plus size={15}/> Add officer / member</button>}<div className="access-list">{memberships.filter(m=>m.guild_id===guildId).map(m=><div className="access-row" key={m.id}><div className="avatar">{initials(m.user_id)}</div><div><b>{m.user_id===session.user.id?"You":m.user_id.slice(0,8)+"…"}</b><span>{m.role}</span></div>{m.user_id===session.user.id&&<span className="you-tag">CURRENT</span>}</div>)}</div></div></section><section className="panel"><PanelHeader icon={Bell} title="Discord integration" subtitle="Send guild announcements to Discord"/><div className="settings-form"><p className="muted">Connect a Discord webhook to post guild event and roster announcements. Webhook URLs are stored server-side and are not exposed to roster viewers.</p>{isOwner?<><button className="btn" onClick={()=>setShowIntegration(true)}><Settings size={15}/> Configure webhook</button><button className="btn subtle" onClick={sendDiscordTest}><ExternalLink size={15}/> Send test announcement</button></>:<span className="muted tiny">Only guild owners/admins can configure integrations.</span>}</div></section></div>}
      </>}
      <footer className="page-footer"><span>GUILDCORE <i/> RF ONLINE NEXT · UNOFFICIAL COMMUNITY TOOL</span><span><span className="online-dot"/> Connected workspace</span></footer>
    </main>
    {showMember&&<Modal title={editing?"Edit roster member":"Add guild member"} close={()=>{setShowMember(false);setEditing(null)}}><form className="modal-form" onSubmit={saveMember}><label>In-game name (IGN)<input className="input" value={memberForm.ign} onChange={e=>setMemberForm({...memberForm,ign:e.target.value})} required maxLength={50} placeholder="Exact character name"/></label><div className="two-col"><label>Class<select className="input" value={memberForm.class_name} onChange={e=>setMemberForm({...memberForm,class_name:e.target.value})}>{CLASSES.map(c=><option key={c}>{c}</option>)}</select></label><label>Faction<select className="input" value={memberForm.faction} onChange={e=>setMemberForm({...memberForm,faction:e.target.value})}>{FACTIONS.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Combat Power<input className="input" type="number" min="0" step="1" value={memberForm.combat_power} onChange={e=>setMemberForm({...memberForm,combat_power:e.target.value})} required placeholder="e.g. 283098"/></label><label>Notes (optional)<input className="input" value={memberForm.notes} onChange={e=>setMemberForm({...memberForm,notes:e.target.value})} maxLength={200} placeholder="Role, activity, alt…"/></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={()=>setShowMember(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?"Saving…":"Save member"}</button></div></form></Modal>}
    {showGuild&&<Modal title="Create a guild workspace" close={()=>setShowGuild(false)}><form className="modal-form" onSubmit={createGuild}><p className="muted">Create a separate roster for each guild or alliance you manage.</p><label>Guild / alliance name<input className="input" value={guildForm.name} onChange={e=>setGuildForm({...guildForm,name:e.target.value})} required placeholder="e.g. WeeHu"/></label><label>Server / shard<input className="input" value={guildForm.server} onChange={e=>setGuildForm({...guildForm,server:e.target.value})} placeholder="e.g. Nexus 01"/></label><label>Region<select className="input" value={guildForm.region} onChange={e=>setGuildForm({...guildForm,region:e.target.value})}><option>SEA</option><option>KR</option><option>Global</option><option>Other</option></select></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={()=>setShowGuild(false)}>Cancel</button><button className="btn primary" disabled={busy}>Create guild</button></div></form></Modal>}
    {showEvent&&<Modal title="Create guild event" close={()=>setShowEvent(false)}><form className="modal-form" onSubmit={saveEvent}><label>Event name<input className="input" value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})} required placeholder="e.g. Core World battle"/></label><label>Event type<select className="input" value={eventForm.event_type} onChange={e=>setEventForm({...eventForm,event_type:e.target.value})}>{["Guild event","PvP","War","Raid","Core World","Meeting","Other"].map(c=><option key={c}>{c}</option>)}</select></label><label>Date and time<input className="input" type="datetime-local" value={eventForm.starts_at} onChange={e=>setEventForm({...eventForm,starts_at:e.target.value})} required/></label><label>Location (optional)<input className="input" value={eventForm.location} onChange={e=>setEventForm({...eventForm,location:e.target.value})} placeholder="Map / channel / voice room"/></label><label>Notes (optional)<textarea className="input" value={eventForm.notes} onChange={e=>setEventForm({...eventForm,notes:e.target.value})} rows={3} placeholder="Bring MAU, attendance time, strategy…"/></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={()=>setShowEvent(false)}>Cancel</button><button className="btn primary">Create event</button></div></form></Modal>}
    {showInvite&&<Modal title="Grant guild access" close={()=>setShowInvite(false)}><form className="modal-form" onSubmit={inviteOfficer}><p className="muted">The person needs to register first. Enter the exact account email they used for GuildCore.</p><label>Account email<input className="input" type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} required placeholder="officer@example.com"/></label><label>Access role<select className="input" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="officer">Officer — edit roster, CP, events</option><option value="member">Member — view only</option><option value="admin">Admin — manage guild access</option></select></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={()=>setShowInvite(false)}>Cancel</button><button className="btn primary">Grant access</button></div></form></Modal>}
    {showIntegration&&<Modal title="Configure Discord webhook" close={()=>setShowIntegration(false)}><form className="modal-form" onSubmit={saveDiscord}><p className="muted">In Discord, open Channel Settings → Integrations → Webhooks. Copy the webhook URL and paste it below. Treat it like a password.</p><label>Webhook URL<input className="input" type="url" value={discordWebhook} onChange={e=>setDiscordWebhook(e.target.value)} required placeholder="https://discord.com/api/webhooks/…"/></label><label>Channel label (optional)<input className="input" value={discordChannel} onChange={e=>setDiscordChannel(e.target.value)} placeholder="#guild-announcements"/></label><div className="modal-actions"><button type="button" className="btn subtle" onClick={()=>setShowIntegration(false)}>Cancel</button><button className="btn primary">Save webhook</button></div></form></Modal>}
    {notice&&<div className="toast">{notice}<button onClick={()=>setNotice("")}><X size={14}/></button></div>}
  </div>;
}

function Brand(){return <div className="brand"><div className="brand-mark"><Swords size={22}/></div><div><b>GUILD<span>CORE</span></b><small>RF ONLINE NEXT · GUILD INTEL</small></div></div>}
function PanelHeader({icon:Icon,title,subtitle,right}){return <div className="panel-head"><div className="panel-title"><div className="panel-icon"><Icon size={17}/></div><div><h2>{title}</h2><p>{subtitle}</p></div></div>{right}</div>}
function StatCard({icon:Icon,label,value,sub,tone}){return <div className={`stat-card ${tone||""}`}><div className="stat-top"><span>{label}</span><Icon size={17}/></div><strong>{value}</strong><small>{sub}</small></div>}
function Overview({guild,roster,totalCP,averageCP,topPlayer,events,distribution,cpTimeline,setTab,isOfficer,setShowEvent}){
  const maxDist=Math.max(1,...distribution.map(x=>x.count));
  return <div className="overview"><div className="hero-banner"><div className="hero-content"><div className="eyebrow"><span className="live-mark"/> GUILD STATUS · OPERATIONAL</div><h1>{guild?.name||"Your guild"} <span>command center</span></h1><p>Track your fighters, monitor combat power, and coordinate your next faction battle.</p><div className="hero-buttons"><button className="btn primary" onClick={()=>setTab("roster")}><Users size={15}/> Manage roster</button><button className="btn ghost" onClick={()=>setTab("rankings")}><Trophy size={15}/> View rankings</button></div></div><div className="hero-emblem"><div className="emblem-ring"><Swords size={54}/></div><span>GUILD DIVISION</span><b>{guild?.region||"SEA"}</b></div><div className="hero-grid-lines"/></div>
  <div className="stats-grid"><StatCard icon={Users} label="Tracked fighters" value={fmt(roster.length)} sub="Characters in roster" tone="cyan"/><StatCard icon={Zap} label="Total combat power" value={fmt(totalCP)} sub="Combined guild CP" tone="blue"/><StatCard icon={ChartNoAxesCombined} label="Average CP" value={fmt(averageCP)} sub="CP per character" tone="green"/><StatCard icon={Crown} label="Guild ace" value={topPlayer?topPlayer.ign:"—"} sub={topPlayer?`${fmt(topPlayer.combat_power)} CP`:"Add your first member"} tone="gold"/></div>
  <div className="overview-grid"><section className="panel"><PanelHeader icon={Trophy} title="Top combatants" subtitle="Current guild power leaders" right={<button className="text-button" onClick={()=>setTab("rankings")}>Full leaderboard <span>→</span></button>}/><div className="mini-leader">{roster.slice(0,5).map((m,i)=><div className="mini-leader-row" key={m.id}><span className={`mini-rank ${i===0?"first":""}`}>{String(i+1).padStart(2,"0")}</span><div className="avatar">{initials(m.ign)}</div><div className="mini-player"><b>{m.ign}</b><span>{m.class_name} · {m.faction}</span></div><div className="mini-power">{fmt(m.combat_power)}<small> CP</small></div></div>)}{!roster.length&&<Empty title="Your roster starts here" text="Add guild members to populate your power rankings."/>}</div></section>
  <section className="panel"><PanelHeader icon={Activity} title="Force composition" subtitle="Class distribution across roster"/><div className="distribution">{distribution.map(d=><div className="dist-item" key={d.name}><div className="dist-label"><span>{d.name}</span><b>{d.count}</b></div><div className="bar"><span style={{width:`${d.count/maxDist*100}%`}}/></div></div>)}{!distribution.length&&<Empty title="No class data" text="Add members to see your force composition."/>}</div></section>
  <section className="panel"><PanelHeader icon={CalendarDays} title="Upcoming operations" subtitle="Guild events and battle plans" right={<button className="text-button" onClick={()=>setTab("events")}>View all <span>→</span></button>}/><div className="upcoming">{events.filter(e=>new Date(e.starts_at)>=new Date()).slice(0,3).map(ev=><div className="upcoming-row" key={ev.id}><div className="calendar-tile"><b>{new Date(ev.starts_at).toLocaleDateString(undefined,{day:"2-digit"})}</b><span>{new Date(ev.starts_at).toLocaleDateString(undefined,{month:"short"})}</span></div><div><b>{ev.title}</b><span>{ev.event_type} · {new Date(ev.starts_at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</span></div></div>)}{!events.filter(e=>new Date(e.starts_at)>=new Date()).length&&<Empty title="No operations scheduled" text={isOfficer?"Create an event to rally your guild.":"Check back when your officers schedule an event."}/>}</div>{isOfficer&&<div className="panel-bottom"><button className="btn subtle wide" onClick={()=>setShowEvent(true)}><Plus size={15}/> Schedule event</button></div>}</section>
  <section className="panel"><PanelHeader icon={History} title="CP activity" subtitle="Recent Combat Power snapshots" right={<button className="text-button" onClick={()=>setTab("history")}>View history <span>→</span></button>}/><div className="activity-placeholder">{cpTimeline.length?<div className="activity-bars">{cpTimeline.map(([label,count],i)=><div className="activity-bar-wrap" key={label}><div className="activity-bar" style={{height:`${Math.max(12,count/Math.max(...cpTimeline.map(x=>x[1]))*100)}%`}}/><span>{label}</span></div>)}</div>:<Empty title="Waiting for CP updates" text="CP changes are recorded whenever a member is added or their power is updated."/>}</div></section></div></div>
}
function RosterTable({roster,isOfficer,editMember,deleteMember}){return <div className="table-wrap"><table className="roster-table"><thead><tr><th>Character / IGN</th><th>Class</th><th>Faction</th><th>Combat Power</th>{isOfficer&&<th>Actions</th>}</tr></thead><tbody>{roster.map((m,i)=><tr key={m.id}><td><div className="table-player"><div className="avatar">{initials(m.ign)}</div><div><b>{m.ign}</b><span>{m.notes||`Guild fighter · #${String(i+1).padStart(2,"0")}`}</span></div></div></td><td><span className="class-tag">{m.class_name}</span></td><td><span className={`faction-tag ${m.faction?.toLowerCase()}`}>{m.faction}</span></td><td className="cp-cell">{fmt(m.combat_power)} <small>CP</small></td>{isOfficer&&<td><div className="actions"><button className="icon-btn" onClick={()=>editMember(m)} title="Edit"><Settings size={15}/></button><button className="icon-btn danger" onClick={()=>deleteMember(m)} title="Remove"><Trash2 size={15}/></button></div></td>}</tr>)}</tbody></table>{!roster.length&&<Empty title="No roster members" text="Add a character to begin tracking your guild's strength."/>}</div>}
function Empty({title,text}){return <div className="empty-state"><div className="empty-icon"><Gamepad2 size={21}/></div><b>{title}</b><p>{text}</p></div>}
function Modal({title,close,children}){return <div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}

export default App;
