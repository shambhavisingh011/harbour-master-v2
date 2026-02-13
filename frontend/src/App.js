import React, { useState, useEffect, useRef } from 'react';
import { Activity, Server, Database, Loader2, CheckCircle, XCircle, Globe, Zap, Settings, Lock, Eye, EyeOff, ShieldCheck, Layers, Info, Network, Cpu, Terminal } from 'lucide-react';
function App() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [showSSTPass, setShowSSTPass] = useState(false);
  const [showReplPass, setShowReplPass] = useState(false);
  
  // --- LOGGING STATE ---
  const [logs, setLogs] = useState([]);
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const logContainerRef = useRef(null);
  const [formData, setFormData] = useState({
    mariadb_version: "10.11",
    node1_ip: "192.168.64.120", node1_name: "db-node-01",
    node2_ip: "192.168.64.121", node2_name: "db-node-02",
    node3_ip: "192.168.64.122", node3_name: "db-node-03",
    lvs1_ip: "192.168.64.123", lvs2_ip: "192.168.64.124",
    async_ip: "192.168.64.125", monitor_ip: "192.168.64.119",
    lvs_vip: "192.168.64.150",
    wsrep_cluster_name: "Galera_Cluster", 
    wsrep_on: "ON",
    wsrep_provider: "/usr/lib/galera/libgalera_smm.so", binlog_format: "ROW",
    default_storage_engine: "InnoDB", innodb_autoinc_lock_mode: "2",
    bind_address: "0.0.0.0", wsrep_sst_method: "mariabackup",
    wsrep_sst_auth: "sst_user:password", repl_user: "repl_user",
    repl_password: "ReplicaSecurePass123!",
    wsrep_strict_ddl: "ON", wsrep_replicate_myisam: "OFF", expire_logs_days: "7",
    wsrep_mode: "REQUIRED_PRIMARY_KEY,STRICT_REPLICATION", binlog_expire_logs_seconds: "604800",
    innodb_buffer_pool_instances: "1", wsrep_slave_threads: "4",
    innodb_undo_tablespaces: "3", wsrep_gtid_domain_id: "1"
  });
  // --- SSE LOGIC ---
  useEffect(() => {
    let eventSource;
    const setupSSE = () => {
      eventSource = new EventSource('http://192.168.64.118:8000/api/logs/stream');
      eventSource.onopen = () => {
        setStreamStatus("Connected");
        console.log("✅ SSE Log Stream Connected");
      };
      eventSource.onmessage = (event) => {
        setLogs((prev) => [...prev, event.data]);
      };
      eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        setStreamStatus("Disconnected");
        eventSource.close();
      };
    };
    setupSSE();
    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);
  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleDeploy = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    setLogs([]);
    const payload = {
      mariadb_version: formData.mariadb_version,
      monitor_ip: formData.monitor_ip,
      async_ip: formData.async_ip,
      lvs_vip: formData.lvs_vip,
      repl_user: formData.repl_user,
      repl_password: formData.repl_password,
      wsrep_cluster_name: formData.wsrep_cluster_name,
      wsrep_on: formData.wsrep_on,
      wsrep_provider: formData.wsrep_provider,
      binlog_format: formData.binlog_format,
      default_storage_engine: formData.default_storage_engine,
      innodb_autoinc_lock_mode: parseInt(formData.innodb_autoinc_lock_mode),
      bind_address: formData.bind_address,
      wsrep_sst_method: formData.wsrep_sst_method,
      wsrep_sst_auth: formData.wsrep_sst_auth,
      galera_nodes: [
        { ip: formData.node1_ip, node_name: formData.node1_name, server_id: 0 },
        { ip: formData.node2_ip, node_name: formData.node2_name, server_id: 0 },
        { ip: formData.node3_ip, node_name: formData.node3_name, server_id: 0 }
      ],
      lvs_ips: [formData.lvs1_ip, formData.lvs2_ip],
      wsrep_strict_ddl: formData.wsrep_strict_ddl,
      wsrep_replicate_myisam: formData.wsrep_replicate_myisam,
      expire_logs_days: parseInt(formData.expire_logs_days),
      wsrep_mode: formData.wsrep_mode,
      binlog_expire_logs_seconds: parseInt(formData.binlog_expire_logs_seconds),
      innodb_buffer_pool_instances: parseInt(formData.innodb_buffer_pool_instances),
      wsrep_slave_threads: parseInt(formData.wsrep_slave_threads),
      innodb_undo_tablespaces: parseInt(formData.innodb_undo_tablespaces),
      wsrep_gtid_domain_id: parseInt(formData.wsrep_gtid_domain_id)
    };
    try {
      const response = await fetch('http://192.168.64.118:8000/deploy', {
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
  // Helper to build the Grafana link
  const getGrafanaURL = () => {
    const host = formData.monitor_ip;
    const dashboardUid = "hm_core_metrics_v1"; 
    return `http://${host}:3000/dashboards`;
  };
  return (
    <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif', maxWidth: '1600px', margin: '0 auto', backgroundColor: '#f5f2f9', minHeight: '100vh' }}>
      
      {/* HEADER */}
      <div style={{ backgroundColor: '#5f259f', padding: '24px', borderRadius: '16px', marginBottom: '20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(95, 37, 159, 0.2)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', letterSpacing: '-0.5px' }}> Harbor Master</h1>
        </div>
        <div style={{ width: '320px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '6px', color: '#ede7f6' }}>MARIADB ENGINE VERSION *</label>
          <select name="mariadb_version" value={formData.mariadb_version} onChange={handleChange} style={headerSelect}>
            <option value="10.5.16">MariaDB 10.5.16</option>
            <option value="10.6.21">MariaDB 10.6.21</option>
            <option value="10.11">MariaDB 10.11</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px 340px', gap: '20px', alignItems: 'start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={formCard}>
              <h3 style={cardTitle}><Settings size={18} color="#6739B7" /> System Variables</h3>
              <RequiredLabel>wsrep_cluster_name</RequiredLabel><input name="wsrep_cluster_name" value={formData.wsrep_cluster_name} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>wsrep_on</RequiredLabel><input name="wsrep_on" value={formData.wsrep_on} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>wsrep_provider</RequiredLabel><input name="wsrep_provider" value={formData.wsrep_provider} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>binlog_format</RequiredLabel><input name="binlog_format" value={formData.binlog_format} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>default_storage_engine</RequiredLabel><input name="default_storage_engine" value={formData.default_storage_engine} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>innodb_autoinc_lock_mode</RequiredLabel><input name="innodb_autoinc_lock_mode" value={formData.innodb_autoinc_lock_mode} onChange={handleChange} style={inputStyle} />
              <RequiredLabel>bind-address</RequiredLabel><input name="bind_address" value={formData.bind_address} onChange={handleChange} style={inputStyle} />
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
            </div>
          </div>
          <button onClick={handleDeploy} disabled={loading} style={deployBtn}>
            {loading ? <Loader2 className="animate-spin" /> : <Zap size={20} fill="white" />}
            {loading ? "PROCESSING..." : "DEPLOY CLUSTER"}
          </button>
        </div>
        {/* MIDDLE COLUMN: ENGINE SETTINGS + RESULTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ ...formCard, borderTop: '6px solid #6739B7' }}>
            <h3 style={{ ...cardTitle, color: '#6739B7' }}><Layers size={18} /> Engine: {formData.mariadb_version}</h3>
            {formData.mariadb_version === "10.5.16" && (
              <>
                <label style={miniLabel}>wsrep_strict_ddl</label><input name="wsrep_strict_ddl" value={formData.wsrep_strict_ddl} onChange={handleChange} style={inputStyle} />
                <label style={miniLabel}>wsrep_replicate_myisam</label><input name="wsrep_replicate_myisam" value={formData.wsrep_replicate_myisam} onChange={handleChange} style={inputStyle} />
                <label style={miniLabel}>expire_logs_days</label><input name="expire_logs_days" value={formData.expire_logs_days} onChange={handleChange} style={inputStyle} />
              </>
            )}
            {(formData.mariadb_version === "10.6.21" || formData.mariadb_version === "10.11") && (
              <>
                <label style={miniLabel}>wsrep_mode</label><textarea name="wsrep_mode" value={formData.wsrep_mode} onChange={handleChange} style={{ ...inputStyle, height: '70px', resize: 'none' }} />
                <label style={miniLabel}>binlog_expire_logs_seconds</label><input name="binlog_expire_logs_seconds" value={formData.binlog_expire_logs_seconds} onChange={handleChange} style={inputStyle} />
                <label style={miniLabel}>innodb_buffer_pool_instances</label><input name="innodb_buffer_pool_instances" value={formData.innodb_buffer_pool_instances} onChange={handleChange} style={inputStyle} />
              </>
            )}
            {formData.mariadb_version === "10.11" && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #d1c4e9' }}>
                <label style={miniLabel}>wsrep_slave_threads</label><input name="wsrep_slave_threads" value={formData.wsrep_slave_threads} onChange={handleChange} style={inputStyle} />
                <label style={miniLabel}>innodb_undo_tablespaces</label><input name="innodb_undo_tablespaces" value={formData.innodb_undo_tablespaces} onChange={handleChange} style={inputStyle} />
                <label style={miniLabel}>wsrep_gtid_domain_id</label><input name="wsrep_gtid_domain_id" value={formData.wsrep_gtid_domain_id} onChange={handleChange} style={inputStyle} />
              </div>
            )}
            <div style={infoBox}><Info size={16} color="#6739B7" /><span>Optional settings optimized for this specific engine version.</span></div>
          </div>
          {report ? (
             <div style={reportContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ color: '#5f259f', margin: 0, fontSize: '18px' }}>{report.status}</h2>
                    <div style={{ 
                        backgroundColor: report.health_report.overall_status === "Healthy" ? "#166534" : "#b91c1c",
                        color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold'
                    }}>{report.health_report.overall_status}</div>
                </div>
                {/* NEW MONITORING DASHBOARD BUTTON */}
                <a 
                  href={getGrafanaURL()} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    backgroundColor: '#f8961e',
                    color: 'white',
                    padding: '14px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    marginBottom: '15px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Activity size={18} />
                  OPEN MONITORING DASHBOARD
                </a>
                <div style={healthSection}>
                   <div style={sectionLabel}><Database size={14}/> Galera Cluster: {report.cluster_name}</div>
                   {report.health_report.galera.map((node, idx) => (
                       <div key={idx} style={healthRow}>
                           <span style={{ fontSize: '12px' }}>{node.host}</span>
                           <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                               <span style={{ fontSize: '10px', color: '#666' }}>Size: {node.cluster_size}</span>
                               <span style={{ color: node.sync_state === "Synced" ? "#166534" : "#b91c1c", fontSize: '11px', fontWeight: 'bold' }}>{node.sync_state}</span>
                           </div>
                       </div>
                   ))}
                </div>
                <div style={healthSection}>
                    <div style={sectionLabel}><Globe size={14}/> Async Replica</div>
                    <div style={healthRow}>
                        <span style={{ fontSize: '12px' }}>{report.health_report.async.host}</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <span style={pill(report.health_report.async.io_running === "Yes")}>IO</span>
                            <span style={pill(report.health_report.async.sql_running === "Yes")}>SQL</span>
                        </div>
                    </div>
                </div>
                <div style={healthSection}>
                    <div style={sectionLabel}><Network size={14}/> LVS Load Balancers</div>
                    <div style={{ fontSize: '11px', marginBottom: '8px', color: '#5f259f', fontWeight: 'bold' }}>VIP: {report.lvs_vip}</div>
                    {report.health_report.lvs.map((lvs, idx) => (
                        <div key={idx} style={healthRow}>
                            <span style={{ fontSize: '12px' }}>{lvs.host}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {lvs.holds_vip && <span style={{ color: '#6739B7', fontWeight: 'bold', fontSize: '10px' }}>[VIP HOLDER]</span>}
                                <CheckCircle size={14} color={lvs.routing_active ? "#166534" : "#ccc"} />
                            </div>
                        </div>
                    ))}
                </div>
             </div>
          ) : (
            <div style={emptyResults}>
                <div style={{ opacity: 0.5 }}><Cpu size={40} /></div>
                <div style={{ marginTop: '10px' }}>Deployment results will appear here</div>
            </div>
          )}
          {error && <div style={errorBox}><strong>Alert:</strong> {error}</div>}
        </div>
        {/* RIGHT COLUMN: ORCHESTRATION CONSOLE - EXTENDED TO END OF PAGE */}
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
          <div style={{ ...formCard, backgroundColor: '#0d1117', borderLeft: '4px solid #6739B7', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ ...cardTitle, color: '#d1c4e9', margin: 0 }}><Terminal size={18} /> Deployment Console</h3>
              <span style={{ 
                fontSize: '10px', 
                padding: '2px 8px', 
                borderRadius: '10px', 
                backgroundColor: streamStatus === "Connected" ? "#166534" : "#b91c1c",
                color: 'white',
                fontWeight: 'bold'
              }}>
                {streamStatus.toUpperCase()}
              </span>
            </div>
            <div 
              ref={logContainerRef}
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
                fontSize: '11px', 
                fontFamily: '"Fira Code", monospace', 
                color: '#a3be8c', 
                backgroundColor: '#000',
                padding: '12px',
                borderRadius: '6px',
                lineHeight: '1.4'
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: '#4c566a', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span>Waiting for orchestration to begin...</span>
                  {streamStatus !== "Connected" && (
                    <span style={{ color: '#b91c1c', fontSize: '10px' }}>
                      ⚠️ SSE Stream offline. Check backend host & firewall.
                    </span>
                  )}
                </div>
              ) : (
                logs.map((log, idx) => {
                  const isTask = log.includes('TASK [');
                  const isPlay = log.includes('PLAY [');
                  return (
                    <div key={idx} style={{ 
                      borderBottom: '1px solid #1a1a1a', 
                      padding: '2px 0', 
                      whiteSpace: 'pre-wrap',
                      color: isTask ? '#58a6ff' : isPlay ? '#d29922' : '#a3be8c',
                      fontWeight: (isTask || isPlay) ? 'bold' : 'normal',
                      marginTop: isTask ? '8px' : '0'
                    }}>{log}</div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
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
const infoBox = { marginTop: '25px', padding: '12px', background: '#ede7f6', borderRadius: '10px', fontSize: '11px', color: '#512da8', display: 'flex', gap: '10px', alignItems: 'center' };
const pill = (active) => ({ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', backgroundColor: active ? '#166534' : '#b91c1c', color: 'white' });
export default App;

