import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Activity, Server, Database, Loader2, ShieldAlert, CheckCircle, XCircle, Globe, Zap, Settings, Lock, Eye, EyeOff, ShieldCheck, Layers, Info, Network, Cpu, Terminal, ArrowRight, ArrowLeft, AlertTriangle, Play, FileCode, Download, User, LogIn } from 'lucide-react';

function App() {
  // --- AUTHENTICATION STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictNodes, setConflictNodes] = useState([]);
  // --- UI & DEPLOYMENT STATE ---
  const [page, setPage] = useState(1); // 1: Config, 2: Deployment/Monitor
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [showSSTPass, setShowSSTPass] = useState(false);
  const [showDBAdminPass, setShowDBAdminPass] = useState(false);
  const [showReplPass, setShowReplPass] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState(0);
  const [milestones, setMilestones] = useState({
    mariadb: "pending", 
    galera: "pending",
    lvs: "pending",
    async: "pending",
    monitoring: "pending"
  });

  // --- LOGGING & STREAMING STATE ---
  const [logs, setLogs] = useState([]);
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const logContainerRef = useRef(null);
  const [dbForm, setDbForm] = useState({ name: '', user: '', pass: '' });
  const [dbError, setDbError] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbMessage, setDbMessage] = useState(null);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
const [authErrorMessage, setAuthErrorMessage] = useState("");
  // --- CONFIGURATION DATA ---
  const [formData, setFormData] = useState({
    mariadb_version: "10.11.16",
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
    repl_password: "ReplicaSecurePass123!",db_admin_password: "AdminSecurePass123!",
    wsrep_strict_ddl: "ON", wsrep_replicate_myisam: "OFF",
    wsrep_mode: "REQUIRED_PRIMARY_KEY,STRICT_REPLICATION", binlog_expire_logs_seconds: "604800",
    innodb_buffer_pool_instances: "1", wsrep_slave_threads: "4",
    innodb_undo_tablespaces: "3", wsrep_gtid_domain_id: "1"
  });

  // --- AUTHENTICATION HANDLERS ---
  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginData(prev => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (loginData.username === 'admin' && loginData.password === 'admin') {
    setIsAuthenticated(true);
    setUserRole('admin');
  } else if (loginData.username === 'viewer' && loginData.password === 'viewer') {
    setIsAuthenticated(true);
    setUserRole('viewer');
  } else {
    setLoginError('Invalid credentials.');
  }
  };
 const parseConflictData = (errorStr) => {
  // Regex to find content inside square brackets [IP: Status, Size: X]
  const regex = /\[(.*?): (.*?), Size: (.*?)\]/g;
  const matches = [];
  let match;

  while ((match = regex.exec(errorStr)) !== null) {
    matches.push({
      ip: match[1],
      status: match[2],
      size: match[3]
    });
  }
  return matches;
};
const ConflictModal = ({ isOpen, data, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <div style={{ color: '#6739B7', marginBottom: '15px' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto' }} />
        </div>

        <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', color: '#512da8', fontWeight: '700' }}>
          ⚠️ Existing Cluster Detected
        </h3>

        <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
          The following nodes already have an active MariaDB installation:
        </p>

        <div style={reportContainer}>
          {data.map((node, index) => (
            <div key={index} style={healthRow}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{node.ip}</span>
                <span style={{ fontSize: '11px', color: '#9575cd' }}>Cluster Size: {node.size}</span>
              </div>
              {/* Using your dynamic badgeStyle function here */}
              <span style={badgeStyle(node.status)}>{node.status}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '12px', color: '#999', marginTop: '15px', fontStyle: 'italic' }}>
          Please wipe these nodes before attempting a new deployment.
        </p>

        <button style={modalBtn} onClick={onClose}>
          Close & Fix
        </button>
      </div>
    </div>
  );
};
const AuthModal = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <div style={{ color: '#d32f2f', marginBottom: '15px' }}>
          <ShieldAlert size={48} style={{ margin: '0 auto' }} />
        </div>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', color: '#b71c1c', fontWeight: '700' }}>
          Access Denied
        </h3>
        <p style={{ fontSize: '15px', color: '#444', lineHeight: '1.6', marginBottom: '20px' }}>
          {message || "You do not have the required permissions to perform this action."}
        </p>
        <div style={{ backgroundColor: '#fff5f5', padding: '12px', borderRadius: '8px', border: '1px solid #ffcdd2', fontSize: '13px', color: '#c62828', marginBottom: '20px' }}>
          <strong>Role:</strong> Viewer (Read-Only Access)
        </div>
        <button style={{ ...modalBtn, backgroundColor: '#d32f2f' }} onClick={onClose}>
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};
  // --- SSE LOG STREAMING EFFECT ---
  useEffect(() => {
    let eventSource;
    let reconnectionTimeout;
      const setupSSE = () => {
	if (isAuthenticated && page === 2) {
        console.log("Initiating SSE Connection...");
        eventSource = new EventSource('/api/logs/stream');
        eventSource.onopen = () => {
          setStreamStatus("Connected");
          console.log("SSE Connected Successfully");
        };

        eventSource.onmessage = (event) => {
          const line = event.data;

          // 1. Progress & Milestone Success Logic
          if (line.includes("PHASE: MARIADB_PREP_START")) {
            setMilestones(m => ({...m, mariadb: "loading"}));
            setProgress(15);
          } else if (line.includes("PHASE: GALERA_SETUP_START")) {
            setMilestones(m => ({...m, mariadb: "done", galera: "loading"}));
            setProgress(40);
          } else if (line.includes("PHASE: LVS_SETUP_START")) {
            setMilestones(m => ({...m, galera: "done", lvs: "loading"}));
            setProgress(65);
          } else if (line.includes("PHASE: ASYNC_SETUP_START")) {
            setMilestones(m => ({...m, lvs: "done", async: "loading"}));
            setProgress(80);
          } else if (line.includes("PHASE: MONITORING_SETUP_START")) {
            setMilestones(m => ({...m, async: "done", monitoring: "loading"}));
            setProgress(90);
          } else if (line.includes("PHASE: DEPLOYMENT_COMPLETE")) {
            setMilestones(m => ({...m, monitoring: "done"}));
            setProgress(100);
          }

          // 2. Error Detection Logic (MOVED INSIDE ONMESSAGE)
          if (line.includes("FAILED!") || line.includes("ERROR!")) {
            setMilestones(m => {
              const newMilestones = { ...m };
              for (let key in newMilestones) {
                if (newMilestones[key] === "loading") {
                  newMilestones[key] = "failed";
                }
              }
              return newMilestones;
            });
          }

          // 3. Update the logs
          setLogs((prev) => [...prev, line]);
        }; // <-- onmessage ends here

        eventSource.onerror = (err) => {
          console.error("SSE Error occurred. Attempting to reconnect...");
          setStreamStatus("Disconnected");
          eventSource.close();
        reconnectionTimeout = setTimeout(() => {
            setupSSE();
          }, 3000);
        };
      }
    };
    setupSSE();
  return () => {
      if (eventSource) eventSource.close();
      if (reconnectionTimeout) clearTimeout(reconnectionTimeout);
    };
  }, [isAuthenticated, page]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleVerifyAndProceed = async () => {
    setValidating(true);
    setError(null);

    // 1. Local Validation
    if (!formData.db_admin_password || formData.db_admin_password.trim() === "") {
      setError("Database Admin Password is required to secure the cluster.");
      setValidating(false);
      return; 
    }

    const payload = preparePayload();

    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': userRole // Ensure this is 'viewer' or 'admin'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      // 2. Handle Errors (STOPS NAVIGATION)
      if (!response.ok) {
        const errorMsg = data.detail || "Validation failed";

        // Handle Existing Cluster (Health Modal)
        if (typeof errorMsg === 'string' && (errorMsg.includes("EXISTS|") || errorMsg.includes("Conflict Error"))) {
          const cleanMsg = errorMsg.replace("EXISTS|", "").replace("Conflict Error: ", "");
          const parsedNodes = parseConflictData(cleanMsg);
          setConflictNodes(parsedNodes);
          setIsConflictModalOpen(true);
          setError(null);
        } 
        
        // Handle Unauthorized Viewer (Auth Modal)
        else if (typeof errorMsg === 'string' && errorMsg.includes("AUTHORIZATION_ERROR|")) {
          const cleanMsg = errorMsg.replace("AUTHORIZATION_ERROR|", "");
          setAuthErrorMessage(cleanMsg); 
          setIsAuthModalOpen(true);      // Trigger Pop-up
          setError(null);
        } 
        
        else {
          setError(Array.isArray(data.detail) ? "Check form fields" : errorMsg);
        }
        
        setValidating(false);
        return; // IMPORTANT: This prevents moving to Page 2
      }

      // 3. SUCCESS LOGIC (Only runs for Authorized Admin)
      // If we are here, response.ok is true
      setLogs([]);
      setReport(null);
      setPage(2); // MOVE TO PAGE 2 ONLY HERE
      handlePreview(payload);

    } catch (err) {
      setError(`System Error: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };
  const handlePreview = async (payload) => {
    try {
      const response = await fetch('/api/preview-config', {
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
    element.download = `harbor_master_deployment_${new Date().toISOString()}.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const preparePayload = () => {
    return {
      ...formData,
      db_admin_password: formData.db_admin_password,
      innodb_autoinc_lock_mode: parseInt(formData.innodb_autoinc_lock_mode),
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
  const handleDbProvision = async () => {
    setDbLoading(true);
    setDbError(null);

    // Prepare the payload for the backend
    const payload = {
        db_name: dbForm.name,
        db_user: dbForm.user,
        db_password: dbForm.pass,
        role: dbForm.role,
        ttl: 30, // You can make this a state variable later
        vip: formData.lvs_vip, // Assuming your cluster VIP is in formData
        admin_password: formData.db_admin_password // Assuming root pass is in formData
    };

    try {
        const response = await fetch('/api/api/create-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            // This is where Case A and Case B are caught
            throw new Error(data.detail || "Provisioning failed");
        }

        alert(`Success: ${data.detail}`);
        // Optional: Clear form on success
        setDbForm({ name: '', user: '', pass: '', role: 'Read-Only' });

    } catch (err) {
        setDbError(err.message);
    } finally {
        setDbLoading(false);
    }
};
  const executeDeployment = async () => {
    setLoading(true);
    setError(null);
    setLogs([]);
    
    // Reset progress and milestones to original state
    setProgress(0);
    setMilestones({
        mariadb: "pending",
        galera: "pending",
        lvs: "pending",
        async: "pending",
        monitoring: "pending"
    });

    const payload = preparePayload();
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': userRole },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        if (typeof data.detail === 'string' && data.detail.includes("AUTHORIZATION_ERROR")) {
          setAuthErrorMessage(data.detail.replace("AUTHORIZATION_ERROR|", ""));
          setIsAuthModalOpen(true);
          return; // Stop the function here
        }
        throw new Error(data.detail || "Deployment failed");
      }
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
  const handleCreateDB = async () => {
    if (!dbForm.name || !dbForm.user || !dbForm.pass) {
        setDbMessage({ type: 'error', text: "All fields are required!" });
        return;
    }
    setDbLoading(true);
    setDbMessage(null);
    try {
        const response = await fetch('/api/api/create-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_name: dbForm.name,
                db_user: dbForm.user,
                db_password: dbForm.pass,
                admin_password: formData.db_admin_password, // From Page 1
                vip: formData.lvs_vip // From Page 1
            })
        });
        const data = await response.json();
        if (response.ok) {
            setDbMessage({ type: 'success', text: data.message });
            setDbForm({ name: '', user: '', pass: '' }); // Reset
        } else {
            throw new Error(data.detail);
        }
    } catch (err) {
        setDbMessage({ type: 'error', text: err.message });
    } finally {
        setDbLoading(false);
    }
};
  // --- LOGIN PAGE RENDER ---
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
                 <input name="username" style={{ ...inputStyle, paddingLeft: '40px', marginBottom: 0 }} placeholder="Enter username" value={loginData.username} onChange={handleLoginChange} required />
              </div>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <RequiredLabel>Password</RequiredLabel>
              <div style={passwordWrapper}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', color: '#7e57c2' }} />
                <input type="password" name="password" style={{ ...inputStyle, paddingLeft: '40px', marginBottom: 0 }} placeholder="Enter password" value={loginData.password} onChange={handleLoginChange} required />
              </div>
            </div>
            {loginError && <div style={{ color: '#E91E63', fontSize: '13px', marginBottom: '15px', textAlign: 'center' }}>{loginError}</div>}
            <button type="submit" style={deployBtn}>
              <LogIn size={20} /> ACCESS DASHBOARD
            </button>
          </form>
          <div style={{ marginTop: '30px', fontSize: '11px', color: '#999' }}>
            Secure Infrastructure Gateway v2.0
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP RENDER ---
  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f2f9', minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-loop { animation: spin 1s linear infinite; }
      `}</style>
      
      <div style={{ backgroundColor: '#5f259f', padding: '24px', borderRadius: '16px', marginBottom: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(95, 37, 159, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1 style={{ margin: 0, fontSize: '26px', letterSpacing: '-0.5px' }}> Harbor Master</h1>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>
                <User size={12} style={{ display: 'inline', marginRight: '5px' }} /> {loginData.username}
            </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ width: '320px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '6px', color: '#ede7f6' }}>MARIADB ENGINE VERSION *</label>
            <select name="mariadb_version" value={formData.mariadb_version} onChange={handleChange} style={headerSelect} disabled={loading || validating}>
                <option value="10.6.16">MariaDB 10.6.16</option>
                <option value="10.6.21">MariaDB 10.6.21</option>
                <option value="10.11.16">MariaDB 10.11.16</option>
            </select>
            </div>
            <button onClick={() => setIsAuthenticated(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>Logout</button>
        </div>
      </div>

      {page === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ ...errorBox, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <AlertTriangle size={20} />
              <span><strong>Configuration Error:</strong> {error}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
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
  <h3 style={cardTitle}><Lock size={18} color="#6739B7" /> DB Admin Security</h3>
  <RequiredLabel>db_admin_password</RequiredLabel>
  <div style={passwordWrapper}>
    <input 
      type={showDBAdminPass ? "text" : "password"} 
      name="db_admin_password" 
      value={formData.db_admin_password} 
      onChange={handleChange} 
      style={inputStylePassword} 
      placeholder="Enter MariaDB Root Password"
    />
    <button type="button" onClick={() => setShowDBAdminPass(!showDBAdminPass)} style={eyeBtn}>
      {showDBAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
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

  <div style={{ display: 'flex', alignItems: 'center' }}>
    <RequiredLabel>wsrep_cluster_name</RequiredLabel>

    {/* TOOLTIP START */}
    <div
      style={{ position: 'relative', display: 'inline-flex', marginLeft: '8px' }}
      onMouseEnter={() => setActiveTooltip('clusterName')}
      onMouseLeave={() => setActiveTooltip(null)}
    >
      <HelpCircle size={14} color="#999" />
      <span style={{
        ...tooltipText,
        ...(activeTooltip === 'clusterName' ? tooltipVisible : {})
      }}>
        A unique name for your cluster. All nodes must have the exact same name to connect.
      </span>
    </div>
    {/* TOOLTIP END */}

  </div>
  <input name="wsrep_cluster_name" value={formData.wsrep_cluster_name} onChange={handleChange} style={inputStyle} />

  <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
    <RequiredLabel>wsrep_provider</RequiredLabel>

    {/* TOOLTIP START */}
    <div
      style={{ position: 'relative', display: 'inline-flex', marginLeft: '8px' }}
      onMouseEnter={() => setActiveTooltip('provider')}
      onMouseLeave={() => setActiveTooltip(null)}
    >
      <HelpCircle size={14} color="#999" />
      <span style={{
        ...tooltipText,
        ...(activeTooltip === 'provider' ? tooltipVisible : {})
      }}>
        The path to the Galera library. <br/>
        <b>Debian/Ubuntu:</b> /usr/lib/galera/... <br/>
        <b>RedHat/CentOS:</b> /usr/lib64/galera/...
      </span>
    </div>
    {/* TOOLTIP END */}

  </div>
  <select name="wsrep_provider" value={formData.wsrep_provider} onChange={handleChange} style={inputStyle}>
    <option value="/usr/lib/galera/libgalera_smm.so">/usr/lib/galera/libgalera_smm.so</option>
    <option value="/usr/lib64/galera/libgalera_smm.so">/usr/lib64/galera/libgalera_smm.so</option>
  </select>
</div>
            </div>
          </div>
          <div style={{ ...formCard, borderTop: '6px solid #6739B7' }}>
    <h3 style={{ ...cardTitle, color: '#6739B7' }}>
        <Layers size={18} /> Version Specific Parameters: {formData.mariadb_version}
    </h3>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        
        {/* Modern Parameters Section (Always shown for 10.6 and 10.11) */}
        <div>
            <label style={miniLabel}>wsrep_mode</label>
            <textarea 
                name="wsrep_mode" 
                value={formData.wsrep_mode} 
                onChange={handleChange} 
                style={{ ...inputStyle, height: '110px', resize: 'none' }} 
                placeholder="e.g., REQUIRED_PRIMARY_KEY,STRICT_REPLICATION"
            />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
                <label style={miniLabel}>binlog_expire_logs_seconds</label>
                <input 
                    name="binlog_expire_logs_seconds" 
                    value={formData.binlog_expire_logs_seconds} 
                    onChange={handleChange} 
                    style={inputStyle} 
                />
                <span style={{fontSize: '10px', color: '#7e57c2'}}>7 days = 604800s</span>
            </div>
            <div>
                <label style={miniLabel}>innodb_buffer_pool_instances</label>
                <input 
                    name="innodb_buffer_pool_instances" 
                    value={formData.innodb_buffer_pool_instances} 
                    onChange={handleChange} 
                    style={inputStyle} 
                />
            </div>
        </div>

        {/* Extended Parameters (Shown only for 10.11.16) */}
        {formData.mariadb_version === "10.11.16" && (
            <div style={{ 
                gridColumn: 'span 2', 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr', 
                gap: '15px', 
                marginTop: '10px', 
                paddingTop: '10px', 
                borderTop: '1px dashed #d1c4e9' 
            }}>
                <div>
                    <label style={miniLabel}>wsrep_slave_threads</label>
                    <input name="wsrep_slave_threads" value={formData.wsrep_slave_threads} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                    <label style={miniLabel}>innodb_undo_tablespaces</label>
                    <input name="innodb_undo_tablespaces" value={formData.innodb_undo_tablespaces} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                    <label style={miniLabel}>wsrep_gtid_domain_id</label>
                    <input name="wsrep_gtid_domain_id" value={formData.wsrep_gtid_domain_id} onChange={handleChange} style={inputStyle} />
                </div>
            </div>
        )}
    </div>
</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
            <button onClick={handleVerifyAndProceed} disabled={validating} style={{ ...deployBtn, width: '350px', backgroundColor: validating ? '#9575cd' : '#6739B7' }}>
              {validating ? <Loader2 className="animate-spin-loop" size={20} /> : <ShieldCheck size={20} />}
              {validating ? "VERIFYING PARAMETERS..." : "VERIFY & PROCEED"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: Health Reports */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <button
                onClick={() => {
  setPage(1); 
  setError(null); 
  setShowPreview(false);
  // Reset Deployment States
  setProgress(0);
  setMilestones({
    mariadb: "pending",
    galera: "pending",
    lvs: "pending",
    async: "pending",
    monitoring: "pending"
  });
  setLogs([]); // Optional: Clear logs too for a fresh start
}}
                disabled={loading}
                style={{ ...deployBtn, backgroundColor: loading ? '#b39ddb' : '#7e57c2', padding: '10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                <ArrowLeft size={18} /> BACK TO CONFIG
              </button>

            {report && (
              <div style={reportContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ color: '#5f259f', margin: 0, fontSize: '18px' }}>{report.status}</h2>
                    <div style={{
                        backgroundColor: report.health_report.overall_status === "Healthy" ? "#166534" :
                                        report.health_report.overall_status === "CRITICAL" ? "#b91c1c" : "#f59e0b",
                        color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold'
                    }}>
                        {report.health_report.overall_status}
                    </div>
                </div>

                <a href={getGrafanaURL()} target="_blank" rel="noopener noreferrer" style={grafanaBtn}>
                    <Activity size={18} /> OPEN MONITORING DASHBOARD
                </a>

                {/* GALERA SECTION */}
                <div style={healthSection}>
                    <div style={sectionLabel}>
                        <Database size={14}/> Galera Cluster: {report.cluster_name}
                        <span style={{ marginLeft: 'auto', color: '#6739B7' }}>Size: {report.health_report.cluster_size}</span>
                    </div>
                    {report.health_report.galera.map((node, idx) => (
                        <div key={idx} style={healthRow}>
                            <span style={{ fontSize: '12px' }}>{node.host}</span>
                            <span style={{ color: node.sync_state === "Synced" ? "#166534" : "#b91c1c", fontSize: '11px', fontWeight: 'bold' }}>
                                {node.sync_state}
                            </span>
                        </div>
                    ))}
                </div>

                {/* ASYNC SECTION */}
                <div style={healthSection}>
                    <div style={sectionLabel}><Globe size={14}/> Async Replica</div>
                    {report.health_report.async ? (
                        <div style={healthRow}>
                            <span style={{ fontSize: '12px' }}>{report.health_report.async.host}</span>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <span style={pill(report.health_report.async.io === "Yes" || report.health_report.async.io_running === "Yes")}>IO</span>
                                <span style={pill(report.health_report.async.sql === "Yes" || report.health_report.async.sql_running === "Yes")}>SQL</span>
                            </div>
                        </div>
                    ) : <div style={{fontSize: '11px', color: '#999'}}>No Async Node Configured</div>}
                </div>

                {/* LVS HEALTH SECTION */}
                <div style={healthSection}>
                    <div style={sectionLabel}><Network size={14}/> LVS Load Balancers</div>
                    <div style={{ fontSize: '10px', marginBottom: '8px', color: '#5f259f', display: 'flex', justifyContent: 'space-between' }}>
                        <span>VIP: {report.lvs_vip}</span>
                        {report.health_report.active_writer_ip && (
                            <span style={{fontWeight: 'bold'}}>WRITER: {report.health_report.active_writer_ip}</span>
                        )}
                    </div>
                    {report.health_report.lvs.map((lvs, idx) => (
                        <div key={idx} style={{...healthRow, flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '8px 0'}}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: '500' }}>{lvs.host}</span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '9px', color: lvs.ssh || lvs.ssh_reachable ? '#166534' : '#b91c1c' }}>
                                        {lvs.ssh || lvs.ssh_reachable ? "SSH OK" : "SSH FAIL"}
                                    </span>
                                    {lvs.vip || lvs.holds_vip ? <Zap size={14} color="#f8961e" title="Holds VIP" /> : null}
                                    <CheckCircle size={14} color={lvs.target || lvs.pointing_to ? "#166534" : "#ccc"} />
                                </div>
                            </div>
                            {(lvs.target || lvs.pointing_to) && (
                                <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic' }}>
                                    ↳ Routing to: {lvs.target || lvs.pointing_to}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
              </div>
            )}
{/* 2. PROVISION CUSTOM DATABASE */}
{progress === 100 && (
    <div style={formCard}>
        <h3 style={cardTitle}><Database size={18} color="#6739B7" /> Provision Custom Database</h3>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
            Create an isolated database and user on the new cluster via LVS VIP.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                {/* Database Name with Normalization & Forbidden Check */}
                <div>
                    <RequiredLabel>Database Name</RequiredLabel>
                    <input
                        style={{
                            ...inputStyle,
                            borderColor: ['mysql', 'root', 'admin', 'sys', 'information_schema', 'performance_schema'].includes(dbForm.name) ? '#e53935' : '#e0e0e0'
                        }}
                        placeholder="e.g. app_prod"
                        value={dbForm.name}
                        onChange={(e) => setDbForm({ ...dbForm, name: e.target.value.toLowerCase().replace(/\s/g, '') })}
                    />
                    {['mysql', 'root', 'admin', 'sys', 'information_schema', 'performance_schema'].includes(dbForm.name) && (
                        <span style={{ color: '#e53935', fontSize: '10px' }}>Reserved system name forbidden.</span>
                    )}
                </div>

                {/* Username with Normalization */}
                <div>
                    <RequiredLabel>Username</RequiredLabel>
                    <input
                        style={inputStyle}
                        placeholder="e.g. app_user"
                        value={dbForm.user}
                        onChange={(e) => setDbForm({ ...dbForm, user: e.target.value.toLowerCase().replace(/\s/g, '') })}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                {/* Password Field */}
                <div>
                    <RequiredLabel>Password</RequiredLabel>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                            type={showDbPassword ? "text" : "password"}
                            style={{ ...inputStyle, marginBottom: 0, paddingRight: '45px' }}
                            placeholder="••••••••"
                            value={dbForm.pass}
                            onChange={(e) => setDbForm({ ...dbForm, pass: e.target.value })}
                        />
                        <button
                            type="button"
                            onClick={() => setShowDbPassword(!showDbPassword)}
                            style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#6739B7' }}
                        >
                            {showDbPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {/* Role Dropdown */}
                <div>
                    <RequiredLabel>Privilege Role</RequiredLabel>
                    <select
                        style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}
                        value={dbForm.role}
                        onChange={(e) => setDbForm({ ...dbForm, role: e.target.value })}
                    >
                        <option value="Read-Only">Read-Only (SELECT, SHOW VIEW)</option>
                        <option value="Read-Write">Read-Write (SELECT, INSERT, UPDATE, DELETE)</option>
                        <option value="DDL-Admin">Owner/Admin (ALL PRIVILEGES)</option>
                    </select>
                </div>
            </div>

            {/* SRE Conflict Detection Messaging */}
            {/* Note: In a real app, these triggers would come from your backend check API */}
            {dbError && (
                <div style={{ backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px', border: '1px solid #ef9a9a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color="#c62828" />
                    <span style={{ fontSize: '12px', color: '#c62828' }}>{dbError}</span>
                </div>
            )}

            <button
                onClick={handleDbProvision}
                disabled={loading || !dbForm.name || !dbForm.user || !dbForm.pass}
                style={{ ...deployBtn, backgroundColor: '#6739B7', marginTop: '5px' }}
            >
                <ShieldCheck size={18} /> PROVISION DATABASE
            </button>
        </div>
    </div>
)}
    {/* 3. PLACEHOLDER (Existing) */}
    {!report && (
        <div style={emptyResults}>
            <div style={{ opacity: 0.5 }}>{loading ? <Loader2 className="animate-spin-loop" size={40} /> : <Cpu size={40} />}</div>
            <div style={{ marginTop: '10px' }}>{loading ? "Orchestrating MariaDB HA..." : "Ready for Deployment"}</div>
        </div>
    )}

    {/* 4. ERROR BOX (Existing) */}
    {error && (
        <div style={{ ...errorBox, marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <AlertTriangle size={18} />
                <span><strong>Deployment Error:</strong> {error}</span>
            </div>
        </div>
    )}
</div>
	{/* RIGHT COLUMN: Progress, Actions, and Console */}
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', gap: '15px' }}>

            {/* ENHANCED PROGRESS UI WITH ERROR HANDLING */}
            <div style={formCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#5f259f' }}>Deployment Progress</span>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#5f259f' }}>{progress}%</span>
                </div>

                {/* Progress Bar - Turns RED if any milestone failed */}
                <div style={{ width: '100%', height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        backgroundColor: Object.values(milestones).includes("failed") ? "#e53935" : "#6739B7",
                        transition: 'width 0.5s ease-in-out'
                    }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '20px' }}>
                    {Object.entries(milestones).map(([key, status]) => (
                        <div key={key} style={{
                            padding: '10px', borderRadius: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold',
                            backgroundColor:
                                status === 'done' ? '#e8f5e9' :
                                status === 'failed' ? '#ffebee' :
                                status === 'loading' ? '#fff3e0' : '#f5f5f5',
                            color:
                                status === 'done' ? '#2e7d32' :
                                status === 'failed' ? '#c62828' :
                                status === 'loading' ? '#ef6c00' : '#9e9e9e',
                            border: `1px solid ${
                                status === 'done' ? '#4caf50' :
                                status === 'failed' ? '#e53935' :
                                status === 'loading' ? '#ff9800' : '#e0e0e0'
                            }`,
                            textTransform: 'uppercase'
                        }}>
                            {status === 'loading' && <Loader2 size={12} className="animate-spin-loop" style={{marginRight: '5px', display: 'inline'}} />}
                            {status === 'done' && <CheckCircle size={12} style={{marginRight: '5px', display: 'inline'}} />}
                            {status === 'failed' && <XCircle size={12} style={{marginRight: '5px', display: 'inline'}} />}
                            {key.replace('_', ' ')}
                        </div>
                    ))}
                </div>

                <p style={{ fontSize: '13px', color: '#666', marginTop: '15px', fontStyle: 'italic', textAlign: 'center' }}>
                    {Object.values(milestones).includes("failed") ? (
                        <span style={{ color: '#e53935', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} /> Deployment halted due to an error. Check logs below.
                        </span>
                    ) : (
                        <>
                            {progress < 15 && "Initializing infrastructure handshake..."}
                            {progress >= 15 && progress < 40 && "Installing MariaDB dependencies and repositories..."}
                            {progress >= 40 && progress < 65 && "Building Galera Cluster (this may take a few minutes)..."}
                            {progress >= 65 && progress < 80 && "Configuring LVS-DR and Keepalived high availability..."}
                            {progress >= 80 && progress < 90 && "Setting up Asynchronous replication and GTID tracking..."}
                            {progress >= 90 && progress < 100 && "Deploying Prometheus exporters and Grafana dashboards..."}
                            {progress === 100 && "Deployment successful! All systems are operational."}
                        </>
                    )}
                </p>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowPreview(!showPreview)}
                disabled={loading}
                style={{ ...deployBtn, backgroundColor: '#607d8b', flex: 1 }}
              >
                <FileCode size={20} /> {showPreview ? "HIDE PREVIEW" : "PREVIEW CONFIG"}
              </button>
              {!report && (
                <button
                  onClick={executeDeployment}
                  disabled={loading}
                  style={{ ...deployBtn, backgroundColor: loading ? '#7cb342' : '#4CAF50', cursor: loading ? 'not-allowed' : 'pointer', flex: 2, boxShadow: '0 4px 10px rgba(76, 175, 80, 0.3)' }}
                >
                  {loading ? <Loader2 size={20} className="animate-spin-loop" /> : <Play size={20} />}
                  {loading ? "DEPLOYMENT IN PROGRESS..." : "START ORCHESTRATION"}
                </button>
              )}
              {(report || error) && !loading && (
                <button
                  onClick={downloadLogs}
                  style={{ ...deployBtn, backgroundColor: '#2196F3', flex: 1, boxShadow: '0 4px 10px rgba(33, 150, 243, 0.3)' }}
                >
                  <Download size={20} /> DOWNLOAD LOGS
                </button>
              )}
            </div>

            {/* CONFIG PREVIEW */}
            {showPreview && (
              <div style={{ ...formCard, backgroundColor: '#1e1e1e', border: '1px solid #333', padding: '0', overflow: 'hidden' }}>
                <div style={{ background: '#333', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}>/etc/mysql/mariadb.conf.d/60-galera.cnf</span>
                </div>
                <pre style={{ margin: 0, padding: '20px', fontSize: '12px', lineHeight: '1.5', color: '#d4d4d4', background: '#1e1e1e', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: '"Fira Code", monospace' }}>
                  {previewContent || "Generating preview..."}
                </pre>
              </div>
            )}

            {/* DEPLOYMENT CONSOLE */}
            <div style={{ ...formCard, backgroundColor: '#0d1117', borderLeft: '4px solid #6739B7', display: 'flex', flexDirection: 'column', flex: 1, maxHeight:'none',marginBottom: '0',overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ ...cardTitle, color: '#d1c4e9', margin: 0 }}><Terminal size={18} /> Deployment Console</h3>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: streamStatus === "Connected" ? "#166534" : "#b91c1c", color: 'white', fontWeight: 'bold' }}>{streamStatus.toUpperCase()}</span>
                </div>
                <div ref={logContainerRef} style={{ ...consoleBox,flex: 1,overflowY: 'auto',height: '100%'}}>

                    {logs.length === 0 && !loading && <div style={{color: '#4c566a'}}>Terminal ready. Click 'START ORCHESTRATION' to begin.</div>}
                    {logs.map((log, idx) => (
                        <div key={idx} style={{ borderBottom: '1px solid #1a1a1a', padding: '2px 0', whiteSpace: 'pre-wrap', color: log.includes('TASK [') ? '#58a6ff' : log.includes('PLAY [') ? '#d29922' : log.includes('failed=') && !log.includes('failed=0') ? '#ff5f56' : '#a3be8c', fontSize: '13px' }}>{log}</div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      )}
     <ConflictModal 
        isOpen={isConflictModalOpen} 
        data={conflictNodes} 
        onClose={() => setIsConflictModalOpen(false)} 
      />
	<AuthModal
      isOpen={isAuthModalOpen}
      message={authErrorMessage}
      onClose={() => setIsAuthModalOpen(false)}
    />
    </div>
  );
}

// STYLES
const tooltipContainer = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '6px',
    cursor: 'pointer',
    verticalAlign: 'middle'
  };

  const tooltipText = {
    visibility: 'hidden',
    width: '240px',
    backgroundColor: '#333',
    color: '#fff',
    textAlign: 'left',
    borderRadius: '6px',
    padding: '10px',
    position: 'absolute',
    zIndex: 10,
    bottom: '125%',
    left: '50%',
    marginLeft: '-120px',
    opacity: 0,
    transition: 'opacity 0.3s',
    fontSize: '12px',
    lineHeight: '1.4',
    boxShadow: '0px 4px 10px rgba(0,0,0,0.2)'
  };
const tooltipVisible = {
  visibility: 'visible',
  opacity: 1
};
const modalOverlay = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 2000,
  backdropFilter: 'blur(4px)'
};

const modalContent = {
  backgroundColor: '#ffffff',
  padding: '30px',
  borderRadius: '20px',
  width: '500px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  textAlign: 'center',
  border: '1px solid #d1c4e9'
};

const badgeStyle = (status) => ({
  backgroundColor: status.toLowerCase() === 'synced' ? '#dcfce7' : '#fee2e2',
  color: status.toLowerCase() === 'synced' ? '#166534' : '#991b1b',
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 'bold',
  textTransform: 'uppercase'
});

const modalBtn = {
  marginTop: '20px',
  padding: '12px 24px',
  backgroundColor: '#6739B7',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 'bold',
  cursor: 'pointer',
  width: '100%'
};
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
