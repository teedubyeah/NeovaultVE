import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { bookmarkFolders, bookmarksApi, getToken, getSessionPassword } from '../utils/api'
import MinkIcon from '../components/MinkIcon'
import ImportModal from '../components/ImportModal'

function getDomain(url) { try { return new URL(url).hostname.replace('www.','') } catch { return '' } }
function getFavicon(url) { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` } catch { return null } }

function buildTree(folders) {
  const map = {}
  folders.forEach(f => { map[f.id] = { ...f, children: [] } })
  const roots = []
  folders.forEach(f => { if (f.parent_id && map[f.parent_id]) map[f.parent_id].children.push(map[f.id]); else roots.push(map[f.id]) })
  return roots
}
function flattenTree(tree, depth=0) {
  const out=[]
  for(const n of tree){ out.push({...n,depth}); if(n.children?.length) out.push(...flattenTree(n.children,depth+1)) }
  return out
}

// Module-level drag payload to avoid React re-render latency
let dragPayload = null

// ─── FolderTreeItem ──────────────────────────────────────────────────────────
function FolderTreeItem({ folder, selectedId, onSelect, onRename, onDelete, onNewChild, onDrop, depth }) {
  const [expanded, setExpanded] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const hasChildren = folder.children?.length > 0
  const isSelected  = selectedId === folder.id

  return (
    <div>
      <div
        onDragOver={e => { if (dragPayload?.type==='bookmark') { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (dragPayload?.type==='bookmark') onDrop(dragPayload.id, folder.id) }}
        onClick={() => onSelect(folder.id)}
        className="folder-row"
        style={{
          display:'flex', alignItems:'center', gap:6, borderRadius:6, cursor:'pointer',
          padding:`6px 10px 6px ${12+depth*14}px`,
          background: dragOver ? 'rgba(153,184,152,0.18)' : isSelected ? 'rgba(255,132,124,0.13)' : 'transparent',
          border: dragOver ? '1px dashed var(--sage)' : '1px solid transparent',
          color: isSelected ? 'var(--coral)' : 'var(--text2)', transition:'all 0.12s', userSelect:'none',
        }}>
        <span onClick={e=>{e.stopPropagation();setExpanded(v=>!v)}}
          style={{fontSize:9,width:10,flexShrink:0,opacity:hasChildren?0.6:0,display:'inline-block',
            transform:expanded?'rotate(90deg)':'none',transition:'transform 0.15s'}}>▶</span>
        <span style={{fontSize:13,flexShrink:0}}>{expanded&&hasChildren?'📂':'📁'}</span>
        <span style={{fontSize:13,fontWeight:isSelected?600:400,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {folder.name}
        </span>
        <span className="row-actions" style={{display:'flex',gap:1,opacity:0,transition:'opacity 0.12s'}} onClick={e=>e.stopPropagation()}>
          <button className="btn-icon" style={{padding:'2px 5px',fontSize:12}} onClick={()=>onNewChild(folder.id)}>＋</button>
          <button className="btn-icon" style={{padding:'2px 5px',fontSize:12}} onClick={()=>onRename(folder)}>✎</button>
          <button className="btn-icon danger" style={{padding:'2px 5px',fontSize:12}} onClick={()=>onDelete(folder)}>✕</button>
        </span>
      </div>
      {expanded && hasChildren && folder.children.map(c=>(
        <FolderTreeItem key={c.id} folder={c} selectedId={selectedId} depth={depth+1}
          onSelect={onSelect} onRename={onRename} onDelete={onDelete} onNewChild={onNewChild} onDrop={onDrop}/>
      ))}
    </div>
  )
}

// ─── BookmarkCard ────────────────────────────────────────────────────────────
function BookmarkCard({ bookmark, folderName, onEdit, onDelete, onToggleFav }) {
  const favicon = getFavicon(bookmark.url)
  return (
    <div draggable
      onDragStart={e=>{dragPayload={type:'bookmark',id:bookmark.id};e.dataTransfer.effectAllowed='move'}}
      onDragEnd={()=>{dragPayload=null}}
      style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',
        cursor:'grab',transition:'transform 0.12s,box-shadow 0.12s,border-color 0.12s'}}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='var(--shadow)';e.currentTarget.style.borderColor='var(--border2)'}}
      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='';e.currentTarget.style.borderColor='var(--border)'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
        {favicon&&<img src={favicon} alt="" width={14} height={14} style={{marginTop:3,flexShrink:0,borderRadius:2}} onError={e=>e.target.style.display='none'}/>}
        <a href={bookmark.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
          style={{flex:1,color:'var(--text)',fontFamily:'var(--serif)',fontSize:14,fontWeight:600,lineHeight:1.4,
            textDecoration:'none',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}
          onMouseEnter={e=>e.target.style.color='var(--coral)'} onMouseLeave={e=>e.target.style.color='var(--text)'}>
          {bookmark.title||bookmark.url}
        </a>
        <button style={{flexShrink:0,background:'none',border:'none',cursor:'pointer',padding:2,fontSize:15,
          color:bookmark.is_favorite?'var(--coral)':'var(--text3)',lineHeight:1}}
          onClick={()=>onToggleFav(bookmark)}>{bookmark.is_favorite?'★':'☆'}</button>
      </div>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {getDomain(bookmark.url)}
      </div>
      {bookmark.description&&(
        <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.6,marginBottom:8,
          display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
          {bookmark.description}
        </div>
      )}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div>{folderName&&<span style={{fontSize:11,color:'var(--text3)',background:'var(--bg3)',padding:'2px 8px',borderRadius:8,border:'1px solid var(--border)'}}>📁 {folderName}</span>}</div>
        <div style={{display:'flex',gap:4}}>
          <button className="btn-icon" style={{padding:'3px 6px',fontSize:12}} onClick={()=>onEdit(bookmark)}>✎</button>
          <button className="btn-icon danger" style={{padding:'3px 6px',fontSize:12}} onClick={()=>onDelete(bookmark)}>🗑</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modals ──────────────────────────────────────────────────────────────────
function BookmarkModal({ bookmark, folders, defaultFolderId, onClose, onSave }) {
  const [form, setForm] = useState({ title:bookmark?.title||'', url:bookmark?.url||'',
    description:bookmark?.description||'', folder_id:bookmark?.folder_id??defaultFolderId??null, is_favorite:bookmark?.is_favorite||false })
  const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  const flat = flattenTree(buildTree(folders))

  async function handleSave() {
    if (!form.url.trim()) return setError('URL is required')
    let url=form.url.trim(); if(!/^https?:\/\//i.test(url)) url='https://'+url
    setSaving(true); try { await onSave({...form,url}); onClose() } catch(e){setError(e.message)} finally{setSaving(false)}
  }
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:'100%',maxWidth:500,background:'var(--bg2)',border:'1px solid var(--border)',
        borderRadius:16,overflow:'hidden',boxShadow:'var(--shadow-lg)',animation:'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)'}}>
        <div style={{padding:'20px 22px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{fontFamily:'var(--serif)',fontSize:18,color:'var(--text)'}}>{bookmark?'Edit Bookmark':'Add Bookmark'}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{padding:'20px 22px'}}>
          {error&&<div className="error-msg">⚠ {error}</div>}
          <div className="form-group"><label className="form-label">URL</label>
            <input className="form-input" type="text" placeholder="https://example.com" autoFocus
              value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))}/>
          </div>
          <div className="form-group"><label className="form-label">Title</label>
            <input className="form-input" type="text" placeholder="Bookmark title"
              value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
          </div>
          <div className="form-group"><label className="form-label">Description <span style={{opacity:0.5,fontWeight:400}}>(optional)</span></label>
            <textarea className="form-input" rows={3} style={{resize:'vertical',minHeight:68}}
              value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Folder</label>
              <select className="form-input" value={form.folder_id||''} onChange={e=>setForm(f=>({...f,folder_id:e.target.value||null}))}>
                <option value="">— No folder —</option>
                {flat.map(f=><option key={f.id} value={f.id}>{'  '.repeat(f.depth)}{f.depth>0?'↳ ':''}{f.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Favorite</label>
              <label style={{display:'flex',alignItems:'center',gap:10,marginTop:10,cursor:'pointer'}}>
                <input type="checkbox" checked={form.is_favorite} onChange={e=>setForm(f=>({...f,is_favorite:e.target.checked}))}
                  style={{width:16,height:16,accentColor:'var(--coral)',cursor:'pointer'}}/>
                <span style={{fontSize:13,color:'var(--text2)'}}>Mark as favorite</span>
              </label>
            </div>
          </div>
        </div>
        <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',background:'rgba(0,0,0,0.1)',display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" style={{width:'auto'}} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Save bookmark'}</button>
        </div>
      </div>
    </div>
  )
}

function FolderModal({ folder, onClose, onSave }) {
  const [name,setName]=useState(folder?.name||''); const [saving,setSaving]=useState(false)
  async function handleSave(){if(!name.trim())return;setSaving(true);try{await onSave(name.trim());onClose()}finally{setSaving(false)}}
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:'100%',maxWidth:360,background:'var(--bg2)',border:'1px solid var(--border)',
        borderRadius:14,overflow:'hidden',boxShadow:'var(--shadow-lg)',animation:'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)'}}>
        <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)'}}>
          <h3 style={{fontFamily:'var(--serif)',fontSize:17,color:'var(--text)'}}>{folder?'Rename Folder':'New Folder'}</h3>
        </div>
        <div style={{padding:'18px 20px'}}>
          <input className="form-input" autoFocus type="text" placeholder="Folder name" value={name}
            onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()}/>
        </div>
        <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',background:'rgba(0,0,0,0.1)',display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" style={{width:'auto'}} onClick={handleSave} disabled={saving||!name.trim()}>{saving?'…':folder?'Rename':'Create'}</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <h3>{title}</h3><p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function BookmarksPage() {
  const { user, logout, isAdmin } = useAuth()
  const [folders,   setFolders]   = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [filter,  setFilter]  = useState('all')
  const [view,    setView]    = useState('grid')
  const [search,  setSearch]  = useState('')
  const [bookmarkModal, setBookmarkModal] = useState(null)
  const [folderModal,   setFolderModal]   = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [toast,    setToast]    = useState(null)
  const [dragging, setDragging] = useState(false)
  const [unDragOver, setUnDragOver] = useState(false)
  const importRef = useRef(null)
  const [importing,     setImporting]     = useState(false)
  const [importPreview, setImportPreview] = useState(null) // { html, preview }
  const [importHtml,    setImportHtml]    = useState('')

  function showToast(msg, err=false) { setToast({msg,err}); setTimeout(()=>setToast(null),3500) }

  const fetchAll = useCallback(async () => {
    try {
      const [fRes,bRes] = await Promise.all([bookmarkFolders.list(), bookmarksApi.list()])
      setFolders(fRes.folders); setBookmarks(bRes.bookmarks)
    } catch(e){ showToast(e.message,true) } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ fetchAll() },[fetchAll])

  const display = bookmarks.filter(b => {
    if (b.decryption_error) return false
    if (filter==='favorites'&&!b.is_favorite) return false
    if (filter==='uncategorized'&&b.folder_id!=null) return false
    if (selectedFolder!==null&&b.folder_id!==selectedFolder) return false
    if (search) { const q=search.toLowerCase(); return b.title?.toLowerCase().includes(q)||b.url?.toLowerCase().includes(q)||b.description?.toLowerCase().includes(q) }
    return true
  })

  const folderTree = buildTree(folders)
  const folderMap  = Object.fromEntries(folders.map(f=>[f.id,f]))

  // Drag handlers
  function onDragStart() { setDragging(true) }
  function onDragEnd()   { setDragging(false); dragPayload=null }

  async function handleDrop(bookmarkId, targetFolderId) {
    const bm = bookmarks.find(b=>b.id===bookmarkId)
    if (!bm || bm.folder_id===targetFolderId) return
    try {
      await bookmarksApi.move(bookmarkId, targetFolderId)
      setBookmarks(prev=>prev.map(b=>b.id===bookmarkId?{...b,folder_id:targetFolderId}:b))
      showToast('Moved to '+(targetFolderId ? folderMap[targetFolderId]?.name : 'Uncategorized'))
    } catch(e){ showToast(e.message,true) }
  }

  // Folder actions
  async function createFolder(name, parentId) {
    try { const d=await bookmarkFolders.create({name,parent_id:parentId||null}); setFolders(prev=>[...prev,d.folder]) }
    catch(e){ showToast(e.message,true) }
  }
  async function renameFolder(folder, name) {
    try { await bookmarkFolders.update(folder.id,{name}); setFolders(prev=>prev.map(f=>f.id===folder.id?{...f,name}:f)) }
    catch(e){ showToast(e.message,true) }
  }
  function confirmDeleteFolder(folder) {
    setConfirmDialog({ title:'Delete folder', message:`Delete "${folder.name}" and all its contents?`,
      onConfirm: async()=>{ setConfirmDialog(null); try{ await bookmarkFolders.delete(folder.id); await fetchAll(); if(selectedFolder===folder.id)setSelectedFolder(null) }catch(e){showToast(e.message,true)} } })
  }

  // Bookmark actions
  async function saveBookmark(data) {
    if (bookmarkModal && bookmarkModal!=='new') {
      await bookmarksApi.update(bookmarkModal.id,data)
      setBookmarks(prev=>prev.map(b=>b.id===bookmarkModal.id?{...b,...data}:b))
    } else {
      const r=await bookmarksApi.create({...data,folder_id:data.folder_id??selectedFolder})
      setBookmarks(prev=>[r.bookmark,...prev])
    }
    showToast('Bookmark saved')
  }
  function confirmDeleteBookmark(bm) {
    setConfirmDialog({ title:'Delete bookmark', message:`Delete "${bm.title||bm.url}"?`,
      onConfirm: async()=>{ setConfirmDialog(null); try{ await bookmarksApi.delete(bm.id); setBookmarks(prev=>prev.filter(b=>b.id!==bm.id)) }catch(e){showToast(e.message,true)} } })
  }
  async function toggleFav(bm) {
    await bookmarksApi.update(bm.id,{...bm,is_favorite:!bm.is_favorite})
    setBookmarks(prev=>prev.map(b=>b.id===bm.id?{...b,is_favorite:!b.is_favorite}:b))
  }

  // Import / Export
  async function handleImport(e) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const html    = await file.text()
      const preview = await bookmarksApi.importPreview(html)
      setImportHtml(html)
      setImportPreview(preview)
    } catch (err) { showToast('Import failed: ' + err.message, true) }
    finally { setImporting(false); e.target.value = '' }
  }

  async function handleImportComplete(result) {
    setImportPreview(null)
    await fetchAll()
    const parts = []
    if (result.bookmarks_created) parts.push(`${result.bookmarks_created} added`)
    if (result.bookmarks_updated) parts.push(`${result.bookmarks_updated} updated`)
    if (result.bookmarks_skipped) parts.push(`${result.bookmarks_skipped} skipped`)
    if (result.folders_created)   parts.push(`${result.folders_created} folders created`)
    showToast('Import complete: ' + (parts.join(', ') || 'nothing changed'))
  }
  function handleExport() {
    fetch('/api/bookmarks/export',{headers:{Authorization:`Bearer ${getToken()}`,'X-Password':getSessionPassword()||''}})
      .then(r=>r.blob()).then(blob=>{ const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'neovisionve-bookmarks.html'}); a.click(); URL.revokeObjectURL(a.href) })
      .catch(()=>showToast('Export failed',true))
  }

  const heading = selectedFolder ? `📂 ${folderMap[selectedFolder]?.name||''}` :
    filter==='favorites'?'★ Favorites':filter==='uncategorized'?'📌 Uncategorized':'🔖 All Bookmarks'

  return (
    <div className="app-layout" onMouseUp={onDragEnd}>
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><MinkIcon size={18}/></div>
          <span className="topbar-logo-text">Neovision<span>VE</span></span>
        </div>
        <div style={{display:'flex',gap:4,background:'var(--bg3)',borderRadius:8,padding:3,border:'1px solid var(--border)'}}>
          <Link to="/" style={{padding:'5px 14px',borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',textDecoration:'none',color:'var(--text3)'}}>📝 Notes</Link>
          <div style={{padding:'5px 14px',borderRadius:6,fontSize:12,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',background:'var(--bg2)',color:'var(--coral)',border:'1px solid var(--border2)'}}>🔖 Bookmarks</div>
        </div>
        <div className="search-bar">
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search bookmarks…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="topbar-actions">
          {isAdmin&&<Link to="/admin" className="btn btn-ghost btn-sm" style={{fontSize:12}}>⚙ Admin</Link>}
          <Link to="/change-password" className="btn btn-ghost btn-sm" style={{fontSize:12}}>🔑 Password</Link>
          <Link to="/clear-data" className="btn btn-ghost btn-sm" style={{fontSize:12,color:'var(--rose)',opacity:0.7}} title="Clear all my data">🗑 Clear Data</Link>
          <div className="user-chip"><div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div><span>{user?.username}</span></div>
          <button className="btn-icon" title="Sign out" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {/* Sidebar */}
        <aside style={{width:240,flexShrink:0,background:'var(--bg2)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <div style={{padding:'14px 12px 10px',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text3)'}}>Folders</span>
              <button className="btn-icon" style={{padding:'3px 7px',fontSize:14}} onClick={()=>setFolderModal({parentId:null})}>＋</button>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:11,padding:'5px 8px'}} onClick={()=>importRef.current?.click()} disabled={importing}>{importing?'…':'⬆ Import'}</button>
              <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:11,padding:'5px 8px'}} onClick={handleExport}>⬇ Export</button>
              <input ref={importRef} type="file" accept=".html,.htm" style={{display:'none'}} onChange={handleImport}/>
            </div>
          </div>

          <div style={{padding:'8px 8px 4px'}}>
            {[
              {id:'all',icon:'🔖',label:'All Bookmarks',count:bookmarks.filter(b=>!b.decryption_error).length},
              {id:'favorites',icon:'★',label:'Favorites',count:bookmarks.filter(b=>b.is_favorite).length},
              {id:'uncategorized',icon:'📌',label:'Uncategorized',count:bookmarks.filter(b=>!b.folder_id&&!b.decryption_error).length},
            ].map(({id,icon,label,count})=>{
              const active=filter===id&&selectedFolder===null
              const isUncat = id==='uncategorized'
              return (
                <div key={id} onClick={()=>{setFilter(id);setSelectedFolder(null)}}
                  onDragOver={e=>{if(isUncat&&dragPayload?.type==='bookmark'){e.preventDefault();setUnDragOver(true)}}}
                  onDragLeave={()=>setUnDragOver(false)}
                  onDrop={e=>{if(isUncat&&dragPayload?.type==='bookmark'){e.preventDefault();setUnDragOver(false);handleDrop(dragPayload.id,null)}}}
                  style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',borderRadius:6,
                    cursor:'pointer',marginBottom:2,userSelect:'none',
                    background:active?'rgba(255,132,124,0.13)':isUncat&&unDragOver?'rgba(153,184,152,0.18)':'transparent',
                    border:isUncat&&unDragOver?'1px dashed var(--sage)':'1px solid transparent',
                    color:active?'var(--coral)':'var(--text2)',fontSize:13,transition:'all 0.12s'}}>
                  <span>{icon} {label}</span>
                  <span style={{fontSize:11,color:'var(--text3)',background:'var(--bg3)',padding:'1px 7px',borderRadius:8}}>{count}</span>
                </div>
              )
            })}
          </div>

          <div style={{height:1,background:'var(--border)',margin:'4px 12px 6px'}}/>

          <div style={{flex:1,padding:'0 8px 16px',overflowY:'auto'}}>
            {folderTree.length===0&&!loading&&(
              <div style={{fontSize:12,color:'var(--text3)',textAlign:'center',padding:'20px 10px',lineHeight:1.6}}>
                No folders yet.<br/>Import or create one above.
              </div>
            )}
            {folderTree.map(f=>(
              <FolderTreeItem key={f.id} folder={f} depth={0} selectedId={selectedFolder}
                onSelect={id=>{setSelectedFolder(id);setFilter('all')}}
                onRename={f=>setFolderModal({folder:f})}
                onDelete={confirmDeleteFolder}
                onNewChild={pid=>setFolderModal({parentId:pid})}
                onDrop={handleDrop}/>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'12px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,background:'var(--bg2)',flexShrink:0}}>
            <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600,color:'var(--text)',flex:1}}>
              {heading}
              <span style={{fontSize:12,fontFamily:'var(--font)',color:'var(--text3)',marginLeft:10,fontWeight:400}}>
                {display.length} {display.length===1?'bookmark':'bookmarks'}
              </span>
            </div>
            <div style={{display:'flex',background:'var(--bg3)',borderRadius:6,padding:2,border:'1px solid var(--border)'}}>
              {[['grid','⊞'],['list','≡']].map(([v,icon])=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:'4px 10px',borderRadius:4,border:'none',cursor:'pointer',fontSize:15,
                  background:view===v?'var(--bg2)':'transparent',color:view===v?'var(--coral)':'var(--text3)',transition:'all 0.12s'}}>{icon}</button>
              ))}
            </div>
            <button className="btn btn-primary" style={{width:'auto',padding:'8px 18px',fontSize:13}} onClick={()=>setBookmarkModal('new')}>+ Add Bookmark</button>
          </div>

          {dragging&&(
            <div style={{background:'rgba(153,184,152,0.08)',borderBottom:'1px solid rgba(153,184,152,0.25)',
              padding:'7px 22px',fontSize:12,color:'var(--sage)',letterSpacing:'0.5px',flexShrink:0}}>
              ↖ Drop onto a folder in the sidebar to move
            </div>
          )}

          <div style={{flex:1,overflowY:'auto',padding:'18px 22px'}}>
            {loading?(
              <div className="empty-state"><p style={{fontSize:12,letterSpacing:2,textTransform:'uppercase',color:'var(--text3)'}}>Decrypting vault…</p></div>
            ):display.length===0?(
              <div className="empty-state">
                <div style={{fontSize:46,marginBottom:14,opacity:0.25}}>🔖</div>
                <h3>{search?'No results':'No bookmarks here'}</h3>
                <p>{search?'Try a different term':'Add a bookmark or import from a browser'}</p>
                {!search&&(<div style={{display:'flex',gap:10,marginTop:16}}>
                  <button className="btn btn-primary" style={{width:'auto'}} onClick={()=>setBookmarkModal('new')}>+ Add Bookmark</button>
                  <button className="btn btn-ghost" style={{width:'auto'}} onClick={()=>importRef.current?.click()}>⬆ Import from Browser</button>
                </div>)}
              </div>
            ):view==='grid'?(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:12}}>
                {display.map(b=>(
                  <div key={b.id} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                    <BookmarkCard bookmark={b} folderName={b.folder_id?folderMap[b.folder_id]?.name:null}
                      onEdit={b=>setBookmarkModal(b)} onDelete={confirmDeleteBookmark} onToggleFav={toggleFav}/>
                  </div>
                ))}
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {display.map(b=>(
                  <div key={b.id} draggable
                    onDragStart={e=>{onDragStart();dragPayload={type:'bookmark',id:b.id};e.dataTransfer.effectAllowed='move'}}
                    onDragEnd={onDragEnd}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:8,
                      background:'var(--bg2)',border:'1px solid var(--border)',cursor:'grab',transition:'border-color 0.12s'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    {getFavicon(b.url)&&<img src={getFavicon(b.url)} alt="" width={13} height={13} style={{borderRadius:2,flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                    <a href={b.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                      style={{flex:1,color:'var(--text)',fontSize:13,fontWeight:500,textDecoration:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                      onMouseEnter={e=>e.target.style.color='var(--coral)'} onMouseLeave={e=>e.target.style.color='var(--text)'}>
                      {b.title||b.url}
                    </a>
                    <span style={{fontSize:11,color:'var(--text3)',flexShrink:0,minWidth:90,textAlign:'right'}}>{getDomain(b.url)}</span>
                    {b.folder_id&&folderMap[b.folder_id]&&<span style={{fontSize:11,color:'var(--text3)',background:'var(--bg3)',padding:'2px 8px',borderRadius:8,border:'1px solid var(--border)',flexShrink:0}}>{folderMap[b.folder_id].name}</span>}
                    <button style={{background:'none',border:'none',cursor:'pointer',padding:2,fontSize:13,color:b.is_favorite?'var(--coral)':'var(--text3)'}} onClick={()=>toggleFav(b)}>{b.is_favorite?'★':'☆'}</button>
                    <button className="btn-icon" style={{padding:'2px 5px',fontSize:12}} onClick={()=>setBookmarkModal(b)}>✎</button>
                    <button className="btn-icon danger" style={{padding:'2px 5px',fontSize:12}} onClick={()=>confirmDeleteBookmark(b)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast&&(
        <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',
          background:toast.err?'var(--rose)':'var(--bg2)',border:`1px solid ${toast.err?'rgba(232,74,95,0.5)':'var(--sage)'}`,
          color:toast.err?'#fff':'var(--text)',padding:'10px 22px',borderRadius:24,fontSize:13,fontWeight:500,
          boxShadow:'var(--shadow-lg)',animation:'fadeIn 0.2s ease',zIndex:9999,pointerEvents:'none'}}>
          {toast.err?'⚠ ':'✓ '}{toast.msg}
        </div>
      )}

      {importPreview&&<ImportModal html={importHtml} preview={importPreview} onClose={()=>setImportPreview(null)} onComplete={handleImportComplete}/> }
      {bookmarkModal&&<BookmarkModal bookmark={bookmarkModal==='new'?null:bookmarkModal} folders={folders} defaultFolderId={selectedFolder} onClose={()=>setBookmarkModal(null)} onSave={saveBookmark}/>}
      {folderModal&&<FolderModal folder={folderModal.folder} onClose={()=>setFolderModal(null)} onSave={name=>folderModal.folder?renameFolder(folderModal.folder,name):createFolder(name,folderModal.parentId)}/>}
      {confirmDialog&&<ConfirmDialog {...confirmDialog} onCancel={()=>setConfirmDialog(null)}/>}
    </div>
  )
}
