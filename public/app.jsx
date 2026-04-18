const { useState, useEffect, createContext, useContext, useMemo, useRef } = React;

// App Context
const AppContext = createContext();

const INITIAL_SETTINGS = {
  companyName: 'Nexvora',
  tagline: 'Build. Launch. Grow. - Website Design & Development Services',
  udyam: 'UDYAM-WB-23-0076542',
  phone: '6295460734 , 7811089216',
  email: 'nexvoraweb@gmail.com',
  website: 'nexvoraweb.in',
  gstPercent: 18,
  terms: '• Advance required to start the project\n• Remaining payment after project completion\n• Domain and hosting cost paid separately',
  logoUrl: '',
  signatureText: 'Arif Hussain and Surya Mondal\nFounder, Nexvora'
};

// --- Firebase Configuration ---
// REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase only if config is valid
let auth;
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
} else {
  // Mock auth object to prevent errors when Firebase is not set up
  auth = {
    onAuthStateChanged: (cb) => { cb(null); return () => {}; },
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not configured")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not configured")),
    signOut: () => Promise.resolve()
  };
}

const AppProvider = ({ children }) => {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [theme, setTheme] = useState(() => localStorage.getItem('nex_theme') || 'light');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('nex_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);
  const [serverStatus, setServerStatus] = useState('online'); // 'online', 'unreachable', 'no-db'

  // Monitor Auth State (Firebase & Local)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((fbUser) => {
      if (fbUser) {
        setUser(fbUser);
      } else {
        // Only clear if not a local user
        const localUser = localStorage.getItem('nex_user');
        if (!localUser) setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = () => {
    localStorage.removeItem('nex_user');
    auth.signOut();
    setUser(null);
  };

  // Load from API on mount
  useEffect(() => {
    const checkHealth = async () => {
        try {
            const hRes = await fetch('/api/health');
            if (hRes.ok) {
                const hData = await hRes.json();
                setDbConnected(hData.dbConnected);
                setServerStatus(hData.dbConnected ? 'online' : 'no-db');
            } else {
                setServerStatus('unreachable');
                setDbConnected(false);
            }
        } catch(e) { 
            setServerStatus('unreachable');
            setDbConnected(false); 
        }
    };
    checkHealth();

    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      // Load LOCAL BACKUP first (so it's instant)
      const localInv = localStorage.getItem(`nex_backup_inv_${user.uid}`);
      const localCli = localStorage.getItem(`nex_backup_cli_${user.uid}`);
      if (localInv) setInvoices(JSON.parse(localInv));
      if (localCli) setClients(JSON.parse(localCli));

      try {
        let headers = {};
        if (user) {
          if (user.token) {
            headers['Authorization'] = `Bearer ${user.token}`;
          } else if (typeof user.getIdToken === 'function') {
            const idToken = await user.getIdToken();
            headers['Authorization'] = `Bearer ${idToken}`;
          }
        }
        
        const [invRes, cliRes, setRes] = await Promise.all([
          fetch('/api/invoices', { headers }),
          fetch('/api/clients', { headers }),
          fetch('/api/settings', { headers })
        ]);

        if (invRes.ok) {
            const cloudInv = await invRes.json();
            setInvoices(cloudInv);
            localStorage.setItem(`nex_backup_inv_${user.uid}`, JSON.stringify(cloudInv));
        }
        if (cliRes.ok) {
            const cloudCli = await cliRes.json();
            setClients(cloudCli);
            localStorage.setItem(`nex_backup_cli_${user.uid}`, JSON.stringify(cloudCli));
        }
        if (setRes.ok) {
           const fetchedSettings = await setRes.json();
           if (Object.keys(fetchedSettings).length > 0) {
               setSettings(fetchedSettings);
           }
        }
      } catch (e) {
        console.error("Error fetching data:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('nex_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const getNextInvoiceNo = () => {
    return `INV-${String(invoices.length + 1).padStart(3, '0')}`;
  };

  const saveInvoice = async (invoiceObj) => {
    try {
      let headers = { 'Content-Type': 'application/json' };
      if (user) {
        if (user.token) {
          headers['Authorization'] = `Bearer ${user.token}`;
        } else if (typeof user.getIdToken === 'function') {
          const idToken = await user.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      }
      // ALWAYS Save to Local Backup first
      setInvoices(prev => {
        const idx = prev.findIndex(inv => inv.id === invoiceObj.id);
        const updated = idx >= 0 ? [...prev] : [invoiceObj, ...prev];
        if (idx >= 0) updated[idx] = invoiceObj;
        localStorage.setItem(`nex_backup_inv_${user.uid}`, JSON.stringify(updated));
        return updated;
      });

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers,
        body: JSON.stringify(invoiceObj)
      });

      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Cloud sync failed');
      }
      return true;
    } catch (e) { 
      console.error("Cloud Sync failed", e); 
      // We don't alert here anymore because the banner will show the status
      return false;
    }
  };

  const saveClient = async (clientObj) => {
    try {
      let headers = { 'Content-Type': 'application/json' };
      if (user) {
        if (user.token) {
          headers['Authorization'] = `Bearer ${user.token}`;
        } else if (typeof user.getIdToken === 'function') {
          const idToken = await user.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      }
      // ALWAYS Save to Local Backup first
      setClients(prev => {
          const updated = [clientObj, ...prev];
          localStorage.setItem(`nex_backup_cli_${user.uid}`, JSON.stringify(updated));
          return updated;
      });

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers,
        body: JSON.stringify(clientObj)
      });
      
      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Cloud sync failed');
      }

      return true;
    } catch (e) { 
      console.error("Cloud Sync failed", e); 
      return false;
    }
  };

  const saveSettings = async (newSettings) => {
    try {
      let headers = { 'Content-Type': 'application/json' };
      if (user) {
        if (user.token) {
          headers['Authorization'] = `Bearer ${user.token}`;
        } else if (typeof user.getIdToken === 'function') {
          const idToken = await user.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(newSettings)
      });

      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to save settings to cloud');
      }

      setSettings(prev => ({ ...prev, ...newSettings }));
      return true;
    } catch (e) { 
        console.error("Error saving settings", e); 
        alert("⚠️ CLOUD SAVE FAILED: " + e.message);
        return false;
    }
  };

  const exportData = () => {
     const data = { invoices, clients, settings };
     const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = `nexvora-backup-${new Date().toISOString().split('T')[0]}.json`;
     a.click();
  };

  const exportCSV = () => {
     const header = "Invoice No,Date,Due Date,Status,Client,Subtotal,Total\n";
     const rows = invoices.map(i => `${i.invoiceNo},${i.invoiceDate},${i.dueDate},${i.status},${(i.clientName || '').replace(/,/g, ' ')},${i.subtotal},${i.total}`).join('\n');
     const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = "invoices.csv";
     a.click();
  };

  const generateMonthlyInvoices = async () => {
      const recurring = clients.filter(c => c.isRecurring);
      if(recurring.length === 0) return alert('No recurring clients found. Please mark some clients as recurring first.');
      
      let added = 0;
      const todayDate = new Date();
      const invoiceDateStr = todayDate.toISOString().split('T')[0];
      
      const terms = settings.paymentTermsDays || 7;
      const dueDateObj = new Date(todayDate);
      dueDateObj.setDate(dueDateObj.getDate() + terms);
      const dueDateStr = dueDateObj.toISOString().split('T')[0];
      
      for(const rc of recurring) {
         const newInv = {
             id: Date.now() + Math.floor(Math.random() * 1000) + added,
             invoiceNo: 'INV-' + Math.floor(1000 + Math.random() * 9000),
             invoiceDate: invoiceDateStr,
             dueDate: dueDateStr,
             status: 'Sent',
             clientName: rc.name,
             clientEmail: rc.email || '',
             businessName: rc.business || '',
             clientAddress: rc.address || '',
             clientPhone: rc.phone || '',
             services: [ { desc: 'Monthly Maintenance', qty: 1, rate: rc.recurringAmount || 500, amount: rc.recurringAmount || 500 } ],
             includeGst: false, discount: 0, advance: 0,
             subtotal: rc.recurringAmount || 500,
             total: rc.recurringAmount || 500,
             balanceDue: rc.recurringAmount || 500
         };
         await saveInvoice(newInv);
         added++;
      }
      alert(`Successfully generated ${added} monthly invoices!`);
  };

  return (
    <AppContext.Provider value={{
      invoices, setInvoices, saveInvoice, getNextInvoiceNo,
      clients, setClients, saveClient,
      settings, setSettings, saveSettings,
      theme, toggleTheme, loading, authLoading,
      user, setUser, dbConnected, serverStatus, login: (email, pass) => auth.signInWithEmailAndPassword(email, pass),
      signup: (email, pass) => auth.createUserWithEmailAndPassword(email, pass),
      logout,
      exportData, exportCSV, generateMonthlyInvoices
    }}>
      {authLoading ? <div className="loading-screen">Verifying session...</div> : (loading ? <div style={{padding: '50px', textAlign: 'center'}}>Loading data...</div> : children)}
    </AppContext.Provider>
  );
};

// UI Components
const Card = ({ children, className = '' }) => (
  <div className={`card ${className}`}>{children}</div>
);

const Input = ({ label, type="text", ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    {type === "textarea" ? (
      <textarea className="form-input" rows="3" {...props}></textarea>
    ) : (
      <input type={type} className="form-input" {...props} />
    )}
  </div>
);

const Button = ({ children, variant="primary", icon: Icon, onClick, className="" }) => (
  <button className={`btn btn-${variant} ${className}`} onClick={onClick}>
    {Icon && <i data-lucide={Icon}></i>}
    {children}
  </button>
);

// ==== AUTHENTICATION PAGE ====

const Login = () => {
    const { login, signup, theme, setUser } = useContext(AppContext);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [authWait, setAuthWait] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setAuthWait(true);
        try {
            // First try custom backend login
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email, password })
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    const userData = { ...data.user, token: data.token };
                    localStorage.setItem('nex_user', JSON.stringify(userData));
                    setUser(userData);
                    return;
                }
            }

            // Fallback to Firebase if backend login fails (e.g. for other users)
            if (isLogin) {
                await login(email, password);
            } else {
                await signup(email, password);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setAuthWait(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box card">
                <div className="login-header">
                    <div className="login-logo">
                        <i data-lucide="shield-check" style={{ width: 48, height: 48, color: 'var(--primary)' }}></i>
                    </div>
                    <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                    <p className="text-secondary">{isLogin ? 'Sign in to access your dashboard' : 'Get started with Nexvora'}</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <Input 
                        label="User ID / Email" 
                        placeholder="Chandra or email@example.com" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        required 
                    />
                    <Input 
                        label="Password" 
                        type="password" 
                        placeholder="••••••••" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required 
                    />
                    
                    {error && <div className="auth-error">{error}</div>}

                    <Button type="submit" className="w-full" disabled={authWait}>
                        {authWait ? <i data-lucide="loader" className="animate-spin"></i> : (isLogin ? 'Sign In' : 'Sign Up')}
                    </Button>
                </form>

                <div className="login-footer">
                    <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
                    <button className="link-btn" onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                </div>
            </div>
            
            {/* Design elements */}
            <div className="login-decor login-decor-1"></div>
            <div className="login-decor login-decor-2"></div>
        </div>
    );
};

// ==== VIEWS ====

const Dashboard = () => {
  const { invoices, clients } = useContext(AppContext);
  
  const totalRevenue = invoices.filter(i => i.status === 'Paid').reduce((acc, curr) => acc + curr.total, 0);
  const pendingAmount = invoices.filter(i => i.status !== 'Paid').reduce((acc, curr) => acc + curr.balanceDue, 0);
  
  return (
    <div className="page-content">
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      
      <div className="grid-cards">
        <Card className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <i data-lucide="indian-rupee"></i>
          </div>
          <div className="stat-info">
            <div className="form-label">Total Revenue</div>
            <div className="stat-val">₹{totalRevenue.toLocaleString()}</div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
            <i data-lucide="clock"></i>
          </div>
          <div className="stat-info">
            <div className="form-label">Pending Payments</div>
            <div className="stat-val">₹{pendingAmount.toLocaleString()}</div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-hover)', color: 'white' }}>
            <i data-lucide="file-text"></i>
          </div>
          <div className="stat-info">
            <div className="form-label">Total Invoices</div>
            <div className="stat-val">{invoices.length}</div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <i data-lucide="users"></i>
          </div>
          <div className="stat-info">
            <div className="form-label">Total Clients</div>
            <div className="stat-val">{clients.length}</div>
          </div>
        </Card>
      </div>

      <Card>
        <h3 style={{ marginBottom: 16 }}>Recent Invoices</h3>
        {invoices.length === 0 ? <p className="text-secondary">No invoices yet.</p> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 5).map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.invoiceNo}</td>
                    <td>{inv.clientName}</td>
                    <td>{inv.invoiceDate}</td>
                    <td>₹{inv.total.toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${inv.status.toLowerCase()}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const Clients = () => {
  const { clients, invoices, saveClient } = useContext(AppContext);
  const [newClient, setNewClient] = useState({ name: '', business: '', email: '', phone: '', address: '', isRecurring: false, recurringAmount: 500 });
  const [selectedClient, setSelectedClient] = useState(null);

  const addClient = () => {
    if(!newClient.name) return;
    saveClient({ ...newClient, id: Date.now() });
    setNewClient({ name: '', business: '', email: '', phone: '', address: '' });
  };

  const clientInvoices = useMemo(() => {
    if(!selectedClient) return [];
    return invoices.filter(inv => inv.clientName === selectedClient.name);
  }, [selectedClient, invoices]);

  if (selectedClient) {
    return (
        <div className="page-content">
            <div className="flex-row justify-between mb-6">
                <div className="flex-row gap-4">
                    <Button variant="secondary" onClick={() => setSelectedClient(null)} icon="arrow-left">Back</Button>
                    <h2>History for {selectedClient.name}</h2>
                </div>
            </div>

            <div className="grid-cards mb-6">
                <Card className="stat-card">
                    <div className="stat-info">
                        <div className="form-label">Total Bills</div>
                        <div className="stat-val">{clientInvoices.length}</div>
                    </div>
                </Card>
                <Card className="stat-card">
                    <div className="stat-info">
                        <div className="form-label">Total Billed</div>
                        <div className="stat-val">₹{clientInvoices.reduce((a, b) => a + b.total, 0).toLocaleString()}</div>
                    </div>
                </Card>
                <Card className="stat-card">
                    <div className="stat-info">
                        <div className="form-label">Balance Due</div>
                        <div className="stat-val text-danger">₹{clientInvoices.reduce((a, b) => a + b.balanceDue, 0).toLocaleString()}</div>
                    </div>
                </Card>
            </div>

            <Card>
                <h3 className="mb-4">Bill History</h3>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Balance Due</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientInvoices.length === 0 ? (
                                <tr><td colSpan="5" style={{textAlign: 'center', padding: '32px'}}>No bill history found for this client.</td></tr>
                            ) : clientInvoices.map(inv => (
                                <tr key={inv.id}>
                                    <td>{inv.invoiceNo}</td>
                                    <td>{inv.invoiceDate}</td>
                                    <td>₹{inv.total.toLocaleString()}</td>
                                    <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                                    <td>₹{inv.balanceDue.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
  }

  return (
    <div className="page-content">
      <h2 style={{ marginBottom: 24 }}>Clients</h2>
      <Card style={{ marginBottom: 32 }}>
        <h3>Add New Client</h3>
        <div className="form-grid-2-even">
          <Input label="Client Name" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
          <Input label="Business Name" value={newClient.business} onChange={e => setNewClient({...newClient, business: e.target.value})} />
          <Input label="Email" type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} />
          <Input label="Phone" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} />
          <div style={{ gridColumn: '1 / -1' }}>
            <Input label="Address" type="textarea" value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} />
          </div>
        </div>
        <Button onClick={addClient} style={{ marginTop: 16 }}>Add Client</Button>
      </Card>

      <Card>
        <h3 style={{ marginBottom: 16 }}>Client List</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Business</th><th>Email</th><th>Phone</th><th width="120">Actions</th></tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                   <td>{c.name}</td>
                   <td>{c.business}</td>
                   <td>{c.email}</td>
                   <td>{c.phone}</td>
                   <td>
                       <Button variant="secondary" onClick={() => setSelectedClient(c)}>View History</Button>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const SettingsView = () => {
  const { settings, saveSettings } = useContext(AppContext);
  const handleSettingsChange = (field, val) => {
    saveSettings({ [field]: val });
  };

  return (
    <div className="page-content">
      <h2 style={{ marginBottom: 24 }}>Settings</h2>
      <div className="settings-grid">
        <Card>
           <h3 className="mb-4">Company Details</h3>
           <Input label="Company Name" value={settings.companyName} onChange={e => handleSettingsChange('companyName', e.target.value)} />
           <Input label="Tagline" value={settings.tagline} onChange={e => handleSettingsChange('tagline', e.target.value)} />
           <Input label="UDYAM / Registration No" value={settings.udyam} onChange={e => handleSettingsChange('udyam', e.target.value)} />
           <Input label="Phone" value={settings.phone} onChange={e => handleSettingsChange('phone', e.target.value)} />
           <Input label="Email" value={settings.email} onChange={e => handleSettingsChange('email', e.target.value)} />
           <Input label="Website" value={settings.website} onChange={e => handleSettingsChange('website', e.target.value)} />
        </Card>
        <Card>
           <h3 className="mb-4">Invoice Defaults</h3>
           <Input label="Default GST (%)" type="number" value={settings.gstPercent} onChange={e => handleSettingsChange('gstPercent', Number(e.target.value))} />
           <Input label="Signature Text" type="textarea" value={settings.signatureText} onChange={e => handleSettingsChange('signatureText', e.target.value)} />
           <Input label="Terms & Conditions" type="textarea" value={settings.terms} onChange={e => handleSettingsChange('terms', e.target.value)} />
        </Card>
      </div>
    </div>
  );
}

// ==== INVOICE CREATION ====

const InvoicePreview = React.forwardRef(({ data, settings }, ref) => {
  return (
    <div ref={ref} className="invoice-print-container" style={{ filter: 'none', WebkitFontSmoothing: 'antialiased', fontFamily: 'Arial, sans-serif', color: 'black', background: 'white', width: '210mm', height: '296mm', boxSizing: 'border-box', overflow: 'hidden', padding: '12mm 15mm' }}>
      
      {/* Watermark */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.04, zIndex: 0, width: '400px', height: '400px', backgroundImage: `url('bill_background_logo.png')`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}></div>

      {/* Content wrapper to put over watermark */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '5px'}}>
                 <img src={settings.logoUrl || "logo.png"} alt="" style={{ height: '70px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
             </div>
             <div style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{settings.tagline}</div>
             <h2 style={{ fontSize: '44px', fontWeight: '500', margin: '15px 0 10px 0', fontFamily: 'serif', color: '#333'}}>Invoice</h2>
             <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>MSME Registered Enterprise / Udyam No: {settings.udyam}</div>
             
             <div style={{ border: '2px solid #555', borderRadius: '12px', padding: '10px', width: '80%', margin: '0 auto', background: 'transparent', fontSize: '15px', fontWeight: '600', backgroundColor: '#fdfdfd'}}>
                 <div style={{ textAlign: 'center', marginBottom: '2px', fontSize: '16px'}}>Contact Information</div>
                 <div style={{ textAlign: 'center' }}>Phone no- {settings.phone}</div>
                 <div style={{ textAlign: 'center' }}>Email id - {settings.email}</div>
                 <div style={{ textAlign: 'center' }}>Website - {settings.website}</div>
             </div>
          </div>

          {/* Details Row */}
          <div style={{ display: 'flex', border: '2px solid #555', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden', backgroundColor: 'white' }}>
             <div style={{ padding: '12px', flex: 1, borderRight: '2px solid #555' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '16px'}}>Bill To:</div>
                <div style={{ fontSize: '15px'}}>Client Name: {data.clientName}</div>
                <div style={{ fontSize: '15px'}}>Business Name: {data.businessName}</div>
                {data.clientAddress && <div style={{ fontSize: '14px', color: '#222', marginTop: '4px' }}>{data.clientAddress}</div>}
                {data.clientPhone && <div style={{ fontSize: '14px', color: '#222' }}>Ph: {data.clientPhone}</div>}
             </div>
             <div style={{ width: '280px', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                <div style={{ display: 'flex', borderBottom: '2px solid #555', flex: 1 }}>
                    <div style={{ padding: '8px 12px', background: '#a3a3a3', color: 'black', flex: 1, borderRight: '2px solid #555', fontSize: '15px'}}>Bill No</div>
                    <div style={{ padding: '8px 12px', flex: 1, fontWeight: 'bold', fontSize: '15px' }}>{data.invoiceNo}</div>
                </div>
                <div style={{ display: 'flex', borderBottom: '2px solid #555', flex: 1 }}>
                    <div style={{ padding: '8px 12px', background: '#a3a3a3', color: 'black', flex: 1, borderRight: '2px solid #555', fontSize: '15px'}}>Invoice Date:</div>
                    <div style={{ padding: '8px 12px', flex: 1, fontSize: '15px' }}>{data.invoiceDate}</div>
                </div>
                <div style={{ display: 'flex', flex: 1 }}>
                    <div style={{ padding: '8px 12px', background: '#a3a3a3', color: 'black', flex: 1, borderRight: '2px solid #555', fontSize: '15px'}}>Due Date:</div>
                    <div style={{ padding: '8px 12px', flex: 1, fontSize: '15px' }}>{data.dueDate}</div>
                </div>
             </div>
          </div>

          {/* Services Table */}
          <div style={{ border: '2px solid #555', backgroundColor: 'transparent' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
               <thead>
                  <tr>
                     <th style={{ background: '#a3a3a3', padding: '10px', textAlign: 'left', color: 'black', fontSize: '15px', borderRight: '2px solid #555', borderBottom: '2px solid #555'}}>Service Description</th>
                     <th style={{ background: '#a3a3a3', padding: '10px', textAlign: 'center', color: 'black', width: '80px', fontSize: '15px', borderRight: '2px solid #555', borderBottom: '2px solid #555'}}>Qty</th>
                     <th style={{ background: '#a3a3a3', padding: '10px', textAlign: 'center', color: 'black', width: '120px', fontSize: '15px', borderRight: '2px solid #555', borderBottom: '2px solid #555'}}>Rate</th>
                     <th style={{ background: '#a3a3a3', padding: '10px', textAlign: 'center', color: 'black', width: '140px', fontSize: '15px', borderBottom: '2px solid #555'}}>Amount</th>
                  </tr>
               </thead>
               <tbody>
                  {data.services.map((svc, i) => (
                      <tr key={i}>
                          <td style={{ padding: '10px', height: '35px', fontSize: '15px', borderRight: '2px solid #555' }}>{svc.desc}</td>
                          <td style={{ padding: '10px', textAlign: 'center', fontSize: '15px', borderRight: '2px solid #555' }}>{svc.qty}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '15px', borderRight: '2px solid #555' }}>{svc.rate}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontSize: '15px' }}>{svc.amount}</td>
                      </tr>
                  ))}
                  <tr>
                      <td style={{ padding: '0', height: Math.max(30, 160 - (data.services.length * 35)) + 'px', borderRight: '2px solid #555', borderBottom: '2px solid #555' }}></td>
                      <td style={{ padding: '0', borderRight: '2px solid #555', borderBottom: '2px solid #555'}}></td>
                      <td style={{ padding: '0', borderRight: '2px solid #555', borderBottom: '2px solid #555'}}></td>
                      <td style={{ padding: '0', borderBottom: '2px solid #555'}}></td>
                  </tr>
               </tbody>
            </table>

            {/* Summary Footer attached directly below table align right*/}
            <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'white' }}>
                <div style={{ flex: 1, padding: '15px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '15px', color: 'black' }}>Terms & Conditions:</div>
                    <div style={{ whiteSpace: 'pre-line', fontSize: '14px', color: '#222', lineHeight: '1.4' }}>{settings.terms}</div>
                </div>
                <div style={{ width: '380px' }}>
                   {data.includeGst && (
                      <div style={{ display: 'flex', borderBottom: '2px solid #555' }}>
                         <div style={{ padding: '10px', background: '#a3a3a3', flex: 1, borderLeft: '2px solid #555', borderRight: '2px solid #555', fontSize: '15px', color:'black' }}>GST ({settings.gstPercent}%)</div>
                         <div style={{ padding: '10px', flex: 1, textAlign: 'right', fontSize: '15px' }}>{(data.subtotal * (settings.gstPercent / 100)).toFixed(2)}</div>
                      </div>
                   )}
                   <div style={{ display: 'flex', borderBottom: '2px solid #555' }}>
                      <div style={{ padding: '10px', background: '#a3a3a3', color: 'black', flex: 1, borderLeft: '2px solid #555', borderRight: '2px solid #555', fontSize: '15px' }}>Total Amount:</div>
                      <div style={{ padding: '10px', flex: 1, textAlign: 'right', fontSize: '15px' }}>{data.total.toFixed(2)}</div>
                   </div>
                   <div style={{ display: 'flex', borderBottom: '2px solid #555' }}>
                      <div style={{ padding: '10px', background: '#a3a3a3', color:'black', flex: 1, borderLeft: '2px solid #555', borderRight: '2px solid #555', fontSize: '15px' }}>Advance Received:</div>
                      <div style={{ padding: '10px', flex: 1, textAlign: 'right', fontSize: '15px' }}>{data.advance}</div>
                   </div>
                   <div style={{ display: 'flex' }}>
                      <div style={{ padding: '10px', background: '#a3a3a3', color:'black', flex: 1, borderLeft: '2px solid #555', borderRight: '2px solid #555', fontSize: '15px' }}>Balance Due:</div>
                      <div style={{ padding: '10px', flex: 1, textAlign: 'right', fontSize: '15px', fontWeight: 'bold' }}>{data.balanceDue}</div>
                   </div>
                </div>
            </div>
          </div>

          {/* Footer Instructions */}
          <div style={{ position: 'absolute', bottom: '0', left: '0', width: '100%', display: 'flex', justifyContent: 'flex-end', fontSize: '15px' }}>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '16px', color: 'black' }}>Authorized Signature:</div>
                 <div style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '5px' }}>
                    <img src={settings.signatureUrl || "signature.png"} alt="Signature" style={{ maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                 </div>
                 <div style={{ fontWeight: 'bold', whiteSpace: 'pre-line', textAlign: 'center', color: '#222' }}>{settings.signatureText}</div>
              </div>
          </div>
      </div>
    </div>
  );
});

const CreateInvoice = () => {
   const { getNextInvoiceNo, saveInvoice, settings, clients } = useContext(AppContext);
   const printRef = useRef(null);

   const [invoice, setInvoice] = useState({
       id: Date.now(),
       invoiceNo: getNextInvoiceNo(),
       invoiceDate: new Date().toISOString().split('T')[0],
       dueDate: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
       status: 'Pending',
       clientName: '',
       clientEmail: '',
       businessName: '',
       clientAddress: '',
       clientPhone: '',
       services: [{ id: 1, desc: 'Website Development', qty: 1, rate: 5000, amount: 5000 }],
       includeGst: false,
       discount: 0,
       advance: 0,
       subtotal: 5000,
       total: 5000,
       balanceDue: 5000
   });

   // Auto Recalculates whenever numerical fields change
   useEffect(() => {
       const subtotal = invoice.services.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
       const gstAmount = invoice.includeGst ? (subtotal * settings.gstPercent / 100) : 0;
       const total = subtotal + gstAmount - Number(invoice.discount);
       const balanceDue = total - Number(invoice.advance);
       
       let status = 'Pending';
       if(balanceDue <= 0 && total > 0) status = 'Paid';
       else if(Number(invoice.advance) > 0) status = 'Partial';

       setInvoice(prev => ({ ...prev, subtotal, total, balanceDue, status }));
   }, [invoice.services, invoice.includeGst, invoice.discount, invoice.advance, settings.gstPercent]);

   const addService = () => {
      setInvoice(prev => ({
         ...prev, services: [...prev.services, { id: Date.now(), desc: '', qty: 1, rate: 0, amount: 0 }]
      }));
   };

   const updateService = (id, field, value) => {
      setInvoice(prev => ({
         ...prev,
         services: prev.services.map(s => {
             if(s.id === id) {
                 const newS = { ...s, [field]: value };
                 if(field === 'qty' || field === 'rate') {
                     newS.amount = Number(newS.qty || 0) * Number(newS.rate || 0);
                 }
                 return newS;
             }
             return s;
         })
      }));
   };

   const removeService = (id) => {
      if(invoice.services.length <= 1) return;
      setInvoice(prev => ({ ...prev, services: prev.services.filter(s => s.id !== id) }));
   };

   const autofillClient = (e) => {
       const client = clients.find(c => c.name === e.target.value);
       if(client) {
           setInvoice(prev => ({ ...prev, clientName: client.name, clientEmail: client.email || '', businessName: client.business, clientAddress: client.address, clientPhone: client.phone }));
       } else {
           setInvoice(prev => ({ ...prev, clientName: e.target.value }));
       }
   };

   const handleSave = () => {
       saveInvoice(invoice);
       alert("Invoice Saved Successfully!");
   };

   const handlePrint = () => {
       const content = printRef.current;
       const opt = {
          margin: 0,
          filename: `${invoice.invoiceNo}.pdf`,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { scale: 5, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
       };
       html2pdf().from(content).set(opt).save();
   };

   const handleDownloadImage = async () => {
       const content = printRef.current;
       if (!window.html2canvas) {
           alert("html2canvas library is not loaded.");
           return;
       }
       const canvas = await html2canvas(content, { scale: 5, useCORS: true });
       const image = canvas.toDataURL("image/png", 1.0);
       const link = document.createElement('a');
       link.href = image;
       link.download = `${invoice.invoiceNo}.png`;
       link.click();
   };

   const handleEmail = async () => {
       if (!invoice.clientEmail) {
           return alert("Please enter a client email address first.");
       }
       
       const btn = document.getElementById('email-btn');
       if(btn) btn.innerHTML = '<i data-lucide="loader"></i> Sending...';
       
       try {
           const content = printRef.current;
           const opt = {
              margin: 0,
              filename: `${invoice.invoiceNo}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 3, useCORS: true },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
           };
           
           const pdfBase64 = await html2pdf().set(opt).from(content).outputPdf('datauristring');
           
           const subject = `Invoice ${invoice.invoiceNo} from ${settings.companyName}`;
           const text = `Dear ${invoice.clientName || 'Client'},\n\nPlease find the details for invoice ${invoice.invoiceNo} attached as a PDF.\n\nTotal Amount: ₹${invoice.total.toFixed(2)}\nBalance Due: ₹${invoice.balanceDue.toFixed(2)}\nDue Date: ${invoice.dueDate}\n\nThank you for your business!\n\nBest regards,\n${settings.companyName}\n${settings.phone} | ${settings.email}`;
           
               let headers = { 'Content-Type': 'application/json' };
               if (user) {
                 if (user.token) {
                   headers['Authorization'] = `Bearer ${user.token}`;
                 } else if (typeof user.getIdToken === 'function') {
                   const idToken = await user.getIdToken();
                   headers['Authorization'] = `Bearer ${idToken}`;
                 }
               }

           const res = await fetch('/api/send-email', {
               method: 'POST',
               headers,
               body: JSON.stringify({
                   to: invoice.clientEmail,
                   subject,
                   text,
                   pdfBase64,
                   filename: `${invoice.invoiceNo}.pdf`
               })
           });
           
           const result = await res.json();
           if(res.ok) {
               alert("Email sent successfully!");
           } else {
               alert("Failed to send email: " + (result.error || "Unknown error"));
           }
       } catch (err) {
           console.error("Email generation/sending error:", err);
           alert("Something went wrong while sending the email.");
       } finally {
           if(btn) {
               btn.innerHTML = '<i data-lucide="mail"></i> Email';
               if(window.lucide) window.lucide.createIcons();
           }
       }
   };

   return (
       <div className="page-content create-invoice-wrapper" style={{ display: 'flex', gap: '32px' }}>
           {/* Form Area */}
           <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>Create Invoice</h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                     <Button variant="secondary" onClick={handleSave}>Save Draft</Button>
                     <Button variant="primary" onClick={handlePrint}><i data-lucide="file-text"></i> PDF</Button>
                     <Button variant="primary" onClick={handleDownloadImage}><i data-lucide="image"></i> Image</Button>
                     <Button variant="primary" onClick={handleEmail}><i data-lucide="mail"></i> Email</Button>
                  </div>
               </div>

               <Card>
                  <h3 className="mb-4">Client Details</h3>
                  <div className="form-grid-2">
                     <div className="form-group">
                        <label className="form-label">Search / Select Client</label>
                        <select className="form-input" onChange={autofillClient} value={invoice.clientName}>
                            <option value="">-- Custom --</option>
                            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                     </div>
                     <Input label="Client Name" value={invoice.clientName} onChange={e => setInvoice({...invoice, clientName: e.target.value})} />
                     <Input label="Client Email" type="email" value={invoice.clientEmail} onChange={e => setInvoice({...invoice, clientEmail: e.target.value})} />
                     <Input label="Business Name" value={invoice.businessName} onChange={e => setInvoice({...invoice, businessName: e.target.value})} />
                     <Input label="Phone" value={invoice.clientPhone} onChange={e => setInvoice({...invoice, clientPhone: e.target.value})} />
                     <div style={{ gridColumn: '1 / -1' }}>
                         <Input label="Address" type="textarea" value={invoice.clientAddress} onChange={e => setInvoice({...invoice, clientAddress: e.target.value})} />
                     </div>
                  </div>
               </Card>

               <Card>
                   <h3 className="mb-4">Invoice Settings</h3>
                   <div className="form-grid-3">
                       <Input label="Bill No" value={invoice.invoiceNo} onChange={e => setInvoice({...invoice, invoiceNo: e.target.value})} />
                       <Input label="Invoice Date" type="date" value={invoice.invoiceDate} onChange={e => setInvoice({...invoice, invoiceDate: e.target.value})} />
                       <Input label="Due Date" type="date" value={invoice.dueDate} onChange={e => setInvoice({...invoice, dueDate: e.target.value})} />
                   </div>
               </Card>

               <Card>
                   <h3 className="mb-4">Services</h3>
                   <div className="table-container mb-4">
                       <table>
                           <thead>
                               <tr>
                                   <th>Description</th>
                                   <th width="100">Qty</th>
                                   <th width="120">Rate</th>
                                   <th width="120">Amount</th>
                                   <th width="50"></th>
                               </tr>
                           </thead>
                           <tbody>
                               {invoice.services.map(svc => (
                                   <tr key={svc.id}>
                                       <td><input type="text" className="form-input" value={svc.desc} onChange={(e) => updateService(svc.id, 'desc', e.target.value)} /></td>
                                       <td><input type="number" className="form-input" value={svc.qty} onChange={(e) => updateService(svc.id, 'qty', e.target.value)} /></td>
                                       <td><input type="number" className="form-input" value={svc.rate} onChange={(e) => updateService(svc.id, 'rate', e.target.value)} /></td>
                                       <td><input type="number" className="form-input text-right" value={svc.amount} onChange={(e) => updateService(svc.id, 'amount', e.target.value)} /></td>
                                       <td>
                                           <button className="btn-icon text-danger" onClick={() => removeService(svc.id)}>X</button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   <Button variant="secondary" onClick={addService}>+ Add Service</Button>
                   
                   <div style={{ marginTop: '24px', padding: '16px', background: 'var(--sidebar-active)', borderRadius: 'var(--radius-md)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                           <strong>Subtotal:</strong>
                           <span>₹{invoice.subtotal.toFixed(2)}</span>
                       </div>
                       
                       <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor:'pointer' }}>
                           <input type="checkbox" checked={invoice.includeGst} onChange={e => setInvoice({...invoice, includeGst: e.target.checked})} />
                           Add GST ({settings.gstPercent}%)
                       </label>
                       
                       <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                           <Input label="Discount (₹)" type="number" value={invoice.discount} onChange={e => setInvoice({...invoice, discount: e.target.value})} />
                           <Input label="Advance Received (₹)" type="number" value={invoice.advance} onChange={e => setInvoice({...invoice, advance: e.target.value})} />
                       </div>
                       
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 'bold', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                           <span>Total Due:</span>
                           <span>₹{invoice.balanceDue.toFixed(2)}</span>
                       </div>
                   </div>
               </Card>
           </div>
           
           {/* Preview Area (Hidden visibly but ready for PDF, or shown scaled) */}
           <div className="preview-wrapper" style={{ flex: '0 0 500px', alignSelf: 'flex-start', position: 'sticky', top: '90px' }}>
              <div style={{ position: 'relative', background: '#ececec', padding: '16px', borderRadius: '12px', overflow: 'hidden' }}>
                 <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>Live Preview</div>
                 <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', height: '297mm', width: '210mm', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', borderRadius: '4px', background: 'white' }}>
                    <InvoicePreview data={invoice} settings={settings} ref={printRef} />
                 </div>
              </div>
           </div>

       </div>
   );
};

// ==== LAYOUT & ROUTING ====

const App = () => {
   const [currentView, setCurrentView] = useState('dashboard');
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   const { theme, toggleTheme, settings, user, logout, dbConnected } = useContext(AppContext);

   // Initialize Lucide icons on view change
   useEffect(() => {
      lucide.createIcons();
   }, [currentView, theme]);

   const renderView = () => {
       switch(currentView) {
           case 'dashboard': return <Dashboard />;
           case 'create': return <CreateInvoice />;
           case 'clients': return <Clients />;
           case 'settings': return <SettingsView />;
           default: return <Dashboard />;
       }
   };

    if (!user) {
        return <Login />;
    }

    return (
        <div className="app-container">
            {serverStatus !== 'online' && (
                 <div className="warning-banner" style={{
                     position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
                     background: serverStatus === 'unreachable' ? '#991b1b' : '#ef4444', 
                     color: 'white', padding: '12px',
                     textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem',
                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                     boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                 }}>
                     <i data-lucide={serverStatus === 'unreachable' ? 'server-off' : 'shield-alert'} style={{ width: 16 }}></i>
                     {serverStatus === 'unreachable' 
                        ? "CRITICAL: SERVER IS CURRENTLY DOWN/CRASHED. Your data is being safely stored in this browser ONLY." 
                        : "CLOUD STORAGE DISCONNECTED: Data is currently saving to this browser only. Please configure your Firebase Keys on Render."
                     }
                 </div>
            )}
            <div className={`mobile-backdrop ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>
            <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} style={{ marginTop: !dbConnected ? '45px' : '0' }}>
                <div className="sidebar-header">
                    <img src={settings.logoUrl || "logo.png"} alt="" style={{ height: '36px', objectFit: 'contain', borderRadius: '6px' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="sidebar-logo-text" style={{ display: settings.companyName ? 'block' : 'none' }}>{settings.companyName}</div>
                </div>
                <nav className="nav-links" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <a className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}>
                        <i data-lucide="layout-dashboard"></i> Dashboard
                    </a>
                    <a className={`nav-item ${currentView === 'create' ? 'active' : ''}`} onClick={() => { setCurrentView('create'); setMobileMenuOpen(false); }}>
                        <i data-lucide="plus-circle"></i> Create Invoice
                    </a>
                    <a className={`nav-item ${currentView === 'clients' ? 'active' : ''}`} onClick={() => { setCurrentView('clients'); setMobileMenuOpen(false); }}>
                        <i data-lucide="users"></i> Clients
                    </a>
                    <a className={`nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => { setCurrentView('settings'); setMobileMenuOpen(false); }}>
                        <i data-lucide="settings"></i> Settings
                    </a>
                    <div style={{ flex: 1 }}></div>
                    <a className="nav-item text-danger" onClick={logout} style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <i data-lucide="log-out"></i> Sign Out
                    </a>
                </nav>
                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
                     <div style={{ 
                         padding: '10px 14px', 
                         borderRadius: 'var(--radius-sm)', 
                         background: 'rgba(52, 211, 153, 0.1)', 
                         color: 'rgb(16, 185, 129)',
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px',
                         fontSize: '0.8rem'
                     }}>
                         <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }}></div>
                         Cloud Sync Active
                     </div>
                </div>
                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                     <p>Nexvora Invoice v1.0</p>
                </div>
            </aside>
            
            <main className="main-content">
                <header className="topbar">
                    <button className="btn-icon hamburger-btn" onClick={() => setMobileMenuOpen(true)}>
                        <i data-lucide="menu"></i>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>{user.email}</span>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Overview</h1>
                    </div>
                    <button className="btn-icon" onClick={toggleTheme}>
                        <i data-lucide={theme === 'dark' ? 'sun' : 'moon'}></i>
                    </button>
                </header>
                {renderView()}
            </main>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
   <AppProvider>
      <App />
   </AppProvider>
);
