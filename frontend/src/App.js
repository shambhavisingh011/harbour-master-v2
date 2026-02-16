import React, { useState, useEffect, useRef } from 'react';
import { Activity, Server, Database, Loader2, CheckCircle, XCircle, Globe, Zap, Settings, Lock, Eye, EyeOff, ShieldCheck, Layers, Info, Network, Cpu, Terminal, ArrowRight, ArrowLeft, AlertTriangle, Play, FileCode, Download, User, LogIn, ShieldAlert, Users, UserPlus, X } from 'lucide-react';

function App() {
  // --- UPDATED: MOVED USERS TO STATE TO ALLOW UI UPDATES ---
  const [userRegistry, setUserRegistry] = useState([
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'operator', password: 'operator', role: 'admin' },
    { username: 'viewer', password: 'viewer!', role: 'viewer' }
  ]);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  
  // --- NEW: USER MANAGEMENT STATE ---
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' });

  const [page, setPage] = useState(1); 
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [showSSTPass, setShowSSTPass] = useState(false);
  const [showReplPass, setShowReplPass] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  
  const [logs, setLogs] = useState([]);
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const logContainerRef = useRef(null);

  const [formData, setFormData] = useState({
    mariadb_version: "10.11",
    node1_ip: "192.168.64.192", node1_name: "db-node-01",
    node2_ip: "192.168.64.193", node2_name: "db-node-02",
    node3_ip: "192.168.64.194", node3_name: "db-node-03",
    lvs1_ip: "192.168.64.196", lvs2_ip: "192.168.64.197",
    async_ip: "192.168.64.199", monitor_ip: "192.168.64.201",
    lvs_vip: "192.168.64.150",
    wsrep_cluster_name: "Galera_Cluster", 
    wsrep_on: "ON",
    wsrep_provider: "/usr/lib/galera/libgalera_smm.so", 
    binlog_format: "ROW",
    default_storage_engine: "InnoDB", innodb_autoinc_lock_mode: "2",
    bind_address: "0.0.0.0", wsrep_sst_method: "mariabackup",
    wsrep_sst_auth: "sst_user:password", repl_user: "repl_user",
    repl_password: "ReplicaSecurePass123!",
    wsrep_strict_ddl: "ON", wsrep_replicate_myisam: "OFF", expire_logs_days: "7",
    wsrep_mode: "REQUIRED_PRIMARY_KEY,STRICT_REPLICATION", binlog_expire_logs_seconds: "604800",
    innodb_buffer_pool_instances: "1", wsrep_slave_threads: "4",
    innodb_undo_tablespaces: "3", wsrep_gtid_domain_id: "1"
  });

  useEffect(() => {
    let eventSource;
    if (isAuthenticated) {
      const setupSSE = () => {
        eventSource = new EventSource('http://192.168.64.191:8000/api/logs/stream');
        eventSource.onopen = () => setStreamStatus("Connected");
        eventSource.onmessage = (event) => setLogs((prev) => [...prev, event.data]);
        eventSource.onerror = (err) => {
          setStreamStatus("Disconnected");
          eventSource.close();
        };
      };
      setupSSE();
    }
    return () => { if (eventSource) eventSource.close(); };
  }, [isAuthenticated]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleLoginChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const user = userRegistry.find(u => u.username === loginData.username && u.password === loginData.password);
    if (user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
      setLoginError('');
    } else {
      setLoginError('Access Denied: Invalid credentials or unauthorized user.');
    }
  };

  // --- NEW: HANDLE CREATING USERS ---
  const handleAddUser = (e) => {
    e.preventDefault();
    if (userRegistry.find(u => u.username === newUser.username)) {
      alert("Username already exists.");
      return;
    }
    setUserRegistry([...userRegistry, newUser]);
    setNewUser({ username: '', password: '', role: 'viewer' });
    alert("New user authorized successfully.");
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleVerifyAndProceed = async () => {
    if (currentUser?.role !== 'admin') {
      setError("Authorization Error: Only specific admin users are permitted to modify cluster configurations.");
      return;
    }

    setValidating(true);
    setError(null);
    const payload = preparePayload();
    try {
      const response = await fetch('http://192.168.64.191:8000/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          const errorMsgs = data.detail.map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(", ");
          throw new Error(errorMsgs);
        }
        throw new Error(data.detail || "Validation failed.");
      }
      setLogs([]);
      setReport(null);
      setPage(2);
      handlePreview(payload); 
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handlePreview = async (payload) => {
    try {
      const response = await fetch('http://192.168.64.191:8000/preview-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) setPreviewContent(data.content);
    } catch (err) {
      console.error("Preview failed", err);
    }
  };

  const downloadLogs = () => {
    const element = document.createElement("a");
    const file = new Blob([logs.join("\n")], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `harbor_master_logs_${new Date().toISOString()}.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const preparePayload = () => {
    return {
      ...formData,
      innodb_autoinc_lock_mode: parseInt(formData.innodb_autoinc_lock_mode),
      expire_logs_days: parseInt(formData.expire_logs_days),
      binlog_expire_logs_seconds: parseInt(formData.binlog_expire_logs_seconds),
      innodb_buffer_pool_instances: parseInt(formData.innodb_buffer_pool_instances),
      wsrep_slave_threads: parseInt(formData.wsrep_slave_threads),
      innodb_undo_tablespaces: parseInt(formData.innodb_undo_tablespaces),
      wsrep_gtid_domain_id: parseInt(formData.wsrep_gtid_domain_id),
      galera_nodes: [
        { ip: formData.node1_ip, node_name: formData.node1_name, server_id: 0 },
        { ip: formData.node2_ip, node_name: formData.node2_name, server_id: 0 },
        { ip: formData.node3_ip, node_name: formData.node3_name, server_id: 0 }
      ],
      lvs_ips: [formData.lvs1_ip, formData.lvs2_ip]
    };
  };

  const executeDeployment = async () => {
    if (currentUser?.role !== 'admin') {
        setError("Action Denied: Unauthorized role for cluster deployment.");
        return;
    }
    setLoading(true);
    setError(null);
    setLogs([]);
    const payload = preparePayload();
    try {
      const response = await fetch('http://192.168.64.191:8000/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Deployment failed");
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const RequiredLabel = ({ children }) => (
    <label style={miniLabel}>{children} <span style={{ color: '#E91E63' }}>*</span></label>
  );

  const getGrafanaURL = () => `http://${formData.monitor_ip}:3000/dashboards`;

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f2f9', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ ...formCard, width: '400px', padding: '40px', textAlign: 'center', boxShadow: '0 10px 25px rgba(95, 37, 159, 0.1)' }}>
          <div style={{ backgroundColor: '#5f259f', width: '60px', height: '60px', borderRadius: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 20px' }}>
            <Server color="white" size={32} />
          </div>
          <h2 style={{ color: '#5f259f', marginBottom: '10px', fontSize: '24px' }}>Harbor Master</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '30px' }}>Management Control Plane Login</p>
          <form onSubmit={handleLoginSubmit} style={{ textAlign: 'left' }}>
            <div style={{ marginBottom: '20px' }}>
              <RequiredLabel>Username</RequiredLabel>
              <div style={passwordWrapper}>
                 <User size={18} style={{ position: 'absolute', left: '12px', color: '#7e57c2' }} />
                 <input name="username" style={{ ...inputStyle, paddingLeft: '40px', marginBottom: 0 }} placeholder="Registered username" value={loginData.username} onChange={handleLoginChange} required />
              </div>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <RequiredLabel>Password</RequiredLabel>
              <div style={passwordWrapper}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', color: '#7e57c2' }} />
                <input type="password" name="password" style={{ ...inputStyle, paddingLeft: '40px', marginBottom: 0 }} placeholder="Password" value={loginData.password} onChange={handleLoginChange} required />
              </div>
            </div>
            {loginError && <div style={{ color: '#E91E63', fontSize: '12px', marginBottom: '15px', textAlign: 'center', backgroundColor: '#fff0f0', padding: '10px', borderRadius: '8px' }}>{loginError}</div>}
            <button type="submit" style={deployBtn}>
              <LogIn size={20} /> AUTHORIZE SESSION
            </button>
          </form>
          <div style={{ marginTop: '30px', fontSize: '11px', color: '#999' }}>Authorized Personnel Only</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f2f9', minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-loop { animation: spin 1s linear infinite; }
      `}</style>
      
      {/* HEADER WITH USER MGMT TOGGLE */}
      <div style={{ backgroundColor: '#5f259f', padding: '24px', borderRadius: '16px', marginBottom: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(95, 37, 159, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1 style={{ margin: 0, fontSize: '26px', letterSpacing: '-0.5px' }}> Harbor Master</h1>
            <div style={{ background: currentUser.role === 'admin' ? '#4CAF50' : '#FF9800', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                <User size={12} style={{ display: 'inline', marginRight: '5px' }} /> {currentUser.username.toUpperCase()} ({currentUser.role.toUpperCase()})
            </div>
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {currentUser.role === 'admin' && (
               <button 
                onClick={() => setShowUserMgmt(!showUserMgmt)} 
                style={{ background: '#7e57c2', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
               >
                 <Users size={16} /> {showUserMgmt ? "CLOSE MGMT" : "USER MGMT"}
               </button>
            )}
            <button onClick={() => {setIsAuthenticated(false); setCurrentUser(null); setPage(1); setShowUserMgmt(false);}} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>Logout</button>
        </div>
      </div>

      {/* NEW: USER MANAGEMENT SECTION */}
      {showUserMgmt && currentUser.role === 'admin' && (
        <div style={{ ...formCard, marginBottom: '20px', border: '2px solid #5f259f', position: 'relative' }}>
          <h3 style={cardTitle}><UserPlus size={18} /> Add Authorized User</h3>
          <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 150px', gap: '15px', alignItems: 'end' }}>
            <div>
              <RequiredLabel>New Username</RequiredLabel>
              <input style={{...inputStyle, marginBottom: 0}} value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} required />
            </div>
            <div>
              <RequiredLabel>New Password</RequiredLabel>
              <input type="password" style={{...inputStyle, marginBottom: 0}} value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} required />
            </div>
            <div>
              <RequiredLabel>Role</RequiredLabel>
              <select style={{...inputStyle, marginBottom: 0}} value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}>
                <option value="admin">Admin (Deployer)</option>
                <option value="viewer">Viewer (Read-Only)</option>
              </select>
            </div>
            <button type="submit" style={{...deployBtn, padding: '10px'}}>CREATE USER</button>
          </form>
        </div>
      )}

      {page === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {currentUser.role !== 'admin' && (
             <div style={{ ...errorBox, background: '#fff9c4', color: '#f57f17', borderColor: '#fbc02d', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={20} />
                <span><strong>Viewer Mode:</strong> You can view current configurations but do not have permission to create or modify clusters.</span>
             </div>
          )}

          {error && (
            <div style={{ ...errorBox, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={20} />
              <span><strong>Configuration Error:</strong> {error}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', opacity: currentUser.role === 'admin' ? 1 : 0.6, pointerEvents: currentUser.role === 'admin' ? 'all' : 'none' }}>
            <div style={formCard}>
              <h3 style={cardTitle}><Database size={18} color="#6739B7" /> Cluster Infrastructure</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[1, 2, 3].map(i => (
                  <React.Fragment key={i}>
                    <div><RequiredLabel>galera-node-{i} (IP)</RequiredLabel><input name={`node${i}_ip`} value={formData[`node${i}_ip`]} onChange={handleChange} style={inputStyle} /></div>
                    <div><RequiredLabel>node-name-{i}</RequiredLabel><input name={`node${i}_name`} value={formData[`node${i}_name`]} onChange={handleChange} style={inputStyle} /></div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '15px', borderTop: '1px solid #f3e5f5', paddingTop: '15px' }}>
                <div><RequiredLabel>lvs-1 IP</RequiredLabel><input name="lvs1_ip" value={formData.lvs1_ip} onChange={handleChange} style={inputStyle} /></div>
                <div><RequiredLabel>lvs-2 IP</RequiredLabel><input name="lvs2_ip" value={formData.lvs2_ip} onChange={handleChange} style={inputStyle} /></div>
                <div><RequiredLabel>async-node IP</RequiredLabel><input name="async_ip" value={formData.async_ip} onChange={handleChange} style={inputStyle} /></div>
                <div><RequiredLabel>monitor-node IP</RequiredLabel><input name="monitor_ip" value={formData.monitor_ip} onChange={handleChange} style={inputStyle} /></div>
                <div style={{ gridColumn: 'span 2' }}><RequiredLabel>virtual-ip (VIP)</RequiredLabel><input name="lvs_vip" value={formData.lvs_vip} onChange={handleChange} style={inputStyle} /></div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={formCard}>
                  <h3 style={cardTitle}><Lock size={18} color="#6739B7" /> SST Security</h3>
                  <RequiredLabel>wsrep_sst_method</RequiredLabel><input name="wsrep_sst_method" value={formData.wsrep_sst_method} onChange={handleChange} style={inputStyle} />
                  <RequiredLabel>wsrep_sst_auth (user:pass)</RequiredLabel>
                  <div style={passwordWrapper}>
                    <input type={showSSTPass ? "text" : "password"} name="wsrep_sst_auth" value={formData.wsrep_sst_auth} onChange={handleChange} style={inputStylePassword} />
                    <button type="button" onClick={() => setShowSSTPass(!showSSTPass)} style={eyeBtn}>{showSSTPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
                <div style={formCard}>
                  <h3 style={cardTitle}><ShieldCheck size={18} color="#6739B7" /> Replication</h3>
                  <RequiredLabel>repl_user</RequiredLabel><input name="repl_user" value={formData.repl_user} onChange={handleChange} style={inputStyle} />
                  <RequiredLabel>repl_password</RequiredLabel>
                  <div style={passwordWrapper}>
                    <input type={showReplPass ? "text" : "password"} name="repl_password" value={formData.repl_password} onChange={handleChange} style={inputStylePassword} />
                    <button type="button" onClick={() => setShowReplPass(!showReplPass)} style={eyeBtn}>{showReplPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
                <div style={formCard}>
                  <h3 style={cardTitle}><Network size={18} color="#6739B7" /> Cluster Identity</h3>
                  <RequiredLabel>wsrep_cluster_name</RequiredLabel><input name="wsrep_cluster_name" value={formData.wsrep_cluster_name} onChange={handleChange} style={inputStyle} />
                  <RequiredLabel>wsrep_provider</RequiredLabel>
                  <select name="wsrep_provider" value={formData.wsrep_provider} onChange={handleChange} style={inputStyle}>
                    <option value="/usr/lib/galera/libgalera_smm.so">/usr/lib/galera/libgalera_smm.so</option>
                    <option value="/usr/lib64/galera/libgalera_smm.so">/usr/lib64/galera/libgalera_smm.so</option>
                  </select>
                </div>
            </div>
          </div>

          <div style={{ ...formCard, borderTop: '6px solid #6739B7', opacity: currentUser.role === 'admin' ? 1 : 0.6, pointerEvents: currentUser.role === 'admin' ? 'all' : 'none' }}>
            <h3 style={{ ...cardTitle, color: '#6739B7' }}><Layers size={18} /> Version Specific Parameters: {formData.mariadb_version}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                {(formData.mariadb_version === "10.6.21" || formData.mariadb_version === "10.11") && (
                <>
                    <div>
                        <label style={miniLabel}>wsrep_mode</label>
                        <textarea name="wsrep_mode" value={formData.wsrep_mode} onChange={handleChange} style={{ ...inputStyle, height: '110px', resize: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div><label style={miniLabel}>binlog_expire_logs_seconds</label><input name="binlog_expire_logs_seconds" value={formData.binlog_expire_logs_seconds} onChange={handleChange} style={inputStyle} /></div>
                        <div><label style={miniLabel}>innodb_buffer_pool_instances</label><input name="innodb_buffer_pool_instances" value={formData.innodb_buffer_pool_instances} onChange={handleChange} style={inputStyle} /></div>
                    </div>
                </>
                )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
            <button onClick={handleVerifyAndProceed} disabled={validating || currentUser.role !== 'admin'} style={{ ...deployBtn, width: '350px', backgroundColor: validating ? '#9575cd' : currentUser.role === 'admin' ? '#6739B7' : '#ccc' }}>
              {validating ? <Loader2 className="animate-spin-loop" size={20} /> : <ShieldCheck size={20} />}
              {validating ? "VERIFYING PARAMETERS..." : "VERIFY & PROCEED"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <button onClick={() => {setPage(1); setError(null); setShowPreview(false);}} disabled={loading} style={{ ...deployBtn, backgroundColor: loading ? '#b39ddb' : '#7e57c2', padding: '10px' }}>
                <ArrowLeft size={18} /> BACK TO CONFIG
              </button>
              {report ? (
                <div style={reportContainer}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h2 style={{ color: '#5f259f', margin: 0, fontSize: '18px' }}>{report.status}</h2>
                        <div style={{ backgroundColor: report.health_report.overall_status === "Healthy" ? "#166534" : "#b91c1c", color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>{report.health_report.overall_status}</div>
                    </div>
                    <a href={getGrafanaURL()} target="_blank" rel="noopener noreferrer" style={grafanaBtn}><Activity size={18} /> MONITORING DASHBOARD</a>
                    <div style={healthSection}>
                        <div style={sectionLabel}><Database size={14}/> Galera: {report.cluster_name}</div>
                        {report.health_report.galera.map((node, idx) => (
                            <div key={idx} style={healthRow}>
                                <span style={{ fontSize: '12px' }}>{node.host}</span>
                                <span style={{ color: node.sync_state === "Synced" ? "#166534" : "#b91c1c", fontSize: '11px', fontWeight: 'bold' }}>{node.sync_state}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={emptyResults}>
                    <div style={{ opacity: 0.5 }}>{loading ? <Loader2 className="animate-spin-loop" size={40} /> : <Cpu size={40} />}</div>
                    <div style={{ marginTop: '10px' }}>{loading ? "Orchestrating Cluster..." : "Ready for Deployment"}</div>
                </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowPreview(!showPreview)} disabled={loading} style={{ ...deployBtn, backgroundColor: '#607d8b', flex: 1 }}>
                <FileCode size={20} /> {showPreview ? "HIDE PREVIEW" : "PREVIEW CONFIG"}
              </button>
              {!report && currentUser.role === 'admin' && (
                 <button onClick={executeDeployment} disabled={loading} style={{ ...deployBtn, backgroundColor: loading ? '#7cb342' : '#4CAF50', flex: 2 }}>
                  {loading ? <Loader2 className="animate-spin-loop" size={20} /> : <Play size={20} />}
                  {loading ? "DEPLOYING..." : "START ORCHESTRATION"}
                </button>
              )}
              {(report || error) && !loading && (
                <button onClick={downloadLogs} style={{ ...deployBtn, backgroundColor: '#2196F3', flex: 1 }}>
                  <Download size={20} /> LOGS
                </button>
              )}
            </div>

            {showPreview && (
              <div style={{ ...formCard, backgroundColor: '#1e1e1e', border: '1px solid #333', padding: '0', overflow: 'hidden' }}>
                <div style={{ background: '#333', padding: '8px 16px', color: '#aaa', fontSize: '11px' }}>/etc/mysql/mariadb.conf.d/60-galera.cnf</div>
                <pre style={{ margin: 0, padding: '20px', fontSize: '12px', color: '#d4d4d4', background: '#1e1e1e', maxHeight: '400px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  {previewContent || "Generating..."}
                </pre>
              </div>
            )}

            <div style={{ ...formCard, backgroundColor: '#0d1117', borderLeft: '4px solid #6739B7', display: 'flex', flexDirection: 'column', flex: 1, maxHeight: showPreview ? 'calc(100vh - 520px)' : 'calc(100vh - 200px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ ...cardTitle, color: '#d1c4e9', margin: 0 }}><Terminal size={18} /> Console</h3>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: streamStatus === "Connected" ? "#166534" : "#b91c1c", color: 'white' }}>{streamStatus.toUpperCase()}</span>
                </div>
                <div ref={logContainerRef} style={consoleBox}>
                    {logs.length === 0 && !loading && <div style={{color: '#4c566a'}}>Click 'START ORCHESTRATION' to begin cluster build.</div>}
                    {logs.map((log, idx) => (
                        <div key={idx} style={{ borderBottom: '1px solid #1a1a1a', padding: '2px 0', whiteSpace: 'pre-wrap', color: log.includes('TASK [') ? '#58a6ff' : log.includes('PLAY [') ? '#d29922' : '#a3be8c', fontSize: '13px' }}>{log}</div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// STYLES
const formCard = { background: '#ffffff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle = { margin: '0 0 16px 0', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '10px', color: '#512da8', fontWeight: '700' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #ede7f6', fontSize: '13px', boxSizing: 'border-box', marginBottom: '12px' };
const inputStylePassword = { ...inputStyle, paddingRight: '40px', marginBottom: 0 };
const passwordWrapper = { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '12px' };
const eyeBtn = { position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#6739B7' };
const miniLabel = { fontSize: '11px', color: '#7e57c2', fontWeight: '700', textTransform: 'uppercase', marginBottom: '5px', display: 'block' };
const headerSelect = { width: '100%', padding: '10px', borderRadius: '10px', backgroundColor: '#6739B7', border: '1.5px solid #9575cd', fontSize: '14px', fontWeight: 'bold', color: 'white' };
const deployBtn = { padding: '16px', background: '#6739B7', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%' };
const errorBox = { padding: '15px', background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '12px', fontSize: '13px' };
const reportContainer = { background: '#f3e5f5', padding: '20px', borderRadius: '16px', border: '1px solid #d1c4e9' };
const healthSection = { backgroundColor: 'rgba(255,255,255,0.6)', padding: '12px', borderRadius: '10px', marginBottom: '12px', border: '1px solid #ede7f6' };
const sectionLabel = { fontSize: '11px', fontWeight: 'bold', color: '#512da8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' };
const healthRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.03)' };
const emptyResults = { height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9575cd', border: '2px dashed #d1c4e9', borderRadius: '16px', textAlign: 'center', padding: '20px' };
const infoBox = { marginTop: '10px', padding: '12px', background: '#ede7f6', borderRadius: '10px', fontSize: '11px', color: '#512da8', display: 'flex', gap: '10px', alignItems: 'center' };
const pill = (active) => ({ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', backgroundColor: active ? '#166534' : '#b91c1c', color: 'white' });
const grafanaBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundColor: '#f8961e', color: 'white', padding: '14px', borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const consoleBox = { flex: 1, overflowY: 'auto', fontSize: '11px', fontFamily: '"Fira Code", monospace', color: '#a3be8c', backgroundColor: '#000', padding: '12px', borderRadius: '6px', lineHeight: '1.4' };

export default App;
