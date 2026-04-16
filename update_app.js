const fs = require('fs');

let appJsx = fs.readFileSync('public/app.jsx', 'utf8');

// 1. Add exportData, exportCSV, and generateMonthlyInvoices to Context inside AppProvider
const newContextFunctions = `
  const exportData = () => {
     const data = { invoices, clients, settings };
     const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = \`nexvora-backup-\${new Date().toISOString().split('T')[0]}.json\`;
     a.click();
  };

  const exportCSV = () => {
     const header = "Invoice No,Date,Due Date,Status,Client,Subtotal,Total\\n";
     const rows = invoices.map(i => \`\${i.invoiceNo},\${i.invoiceDate},\${i.dueDate},\${i.status},\${(i.clientName || '').replace(/,/g, ' ')},\${i.subtotal},\${i.total}\`).join('\\n');
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
         // Create new invoice for client
         const newInv = {
             id: Date.now() + Math.floor(Math.random() * 1000),
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
         // Call API manually or reuse saveInvoice (saveInvoice modifies local state too)
         await saveInvoice(newInv);
         added++;
      }
      alert(\`Successfully generated \${added} monthly invoices!\`);
  };

  return (
    <AppContext.Provider value={{
      invoices, clients, settings, loading, theme, toggleTheme,
      saveInvoice, deleteInvoice, saveClient, deleteClient, saveSettings,
      exportData, exportCSV, generateMonthlyInvoices
    }}>
`;
appJsx = appJsx.replace(/return \(\s*<AppContext\.Provider value=\{\{\s*invoices, clients, settings, loading, theme, toggleTheme,\s*saveInvoice, deleteInvoice, saveClient, deleteClient, saveSettings\s*\}\}>/, newContextFunctions);


// 2. Enhance Dashboard Overdue logic and Analytics
const dashboardTarget = `const pendingInvoices = invoices.filter(i => i.status !== 'Paid');`;
const dashboardReplacement = `
   const pendingInvoices = invoices.filter(i => i.status !== 'Paid');
   const todayScore = new Date().getTime();
   
   // Calculate Monthly Analytics
   const thisMonth = new Date().getMonth();
   const revenueThisMonth = invoices.filter(i => i.status === 'Paid' && new Date(i.invoiceDate).getMonth() === thisMonth).reduce((acc, i) => acc + (i.total || 0), 0);
   const revenueLastMonth = invoices.filter(i => i.status === 'Paid' && new Date(i.invoiceDate).getMonth() === (thisMonth === 0 ? 11 : thisMonth - 1)).reduce((acc, i) => acc + (i.total || 0), 0);
   const growth = revenueLastMonth === 0 ? 100 : Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100);

   // Chart Ref
   const chartRef = React.useRef(null);
   const chartInstance = React.useRef(null);

   useEffect(() => {
       if (chartRef.current && window.Chart) {
           if(chartInstance.current) { chartInstance.current.destroy(); }
           
           // Group paid invoices by month (last 6 months)
           const months = [];
           const data = [];
           for(let i=5; i>=0; i--) {
               const d = new Date();
               d.setMonth(d.getMonth() - i);
               months.push(d.toLocaleString('default', { month: 'short' }));
               const mIdx = d.getMonth();
               const rev = invoices.filter(inv => inv.status === 'Paid' && new Date(inv.invoiceDate).getMonth() === mIdx && new Date(inv.invoiceDate).getFullYear() === d.getFullYear()).reduce((acc, inv) => acc + (inv.total || 0), 0);
               data.push(rev);
           }
           
           chartInstance.current = new window.Chart(chartRef.current, {
               type: 'bar',
               data: {
                   labels: months,
                   datasets: [{
                       label: 'Revenue (₹)',
                       data: data,
                       backgroundColor: '#615FFF',
                       borderRadius: 4
                   }]
               },
               options: {
                   responsive: true,
                   plugins: { legend: { display: false } },
                   scales: { y: { beginAtZero: true } }
               }
           });
       }
   }, [invoices]);
`;
appJsx = appJsx.replace(dashboardTarget, dashboardReplacement);

const dashboardCardsTarget = `<div className="dashboard-grid">`;
const dashboardCardsReplacement = `
     <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <Button onClick={generateMonthlyInvoices} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i data-lucide="zap"></i> Generate Monthly Invoices
          </Button>
     </div>
     <div className="dashboard-grid">
`;
appJsx = appJsx.replace(dashboardCardsTarget, dashboardCardsReplacement);

const revStatOld = `
        <Card className="stat-card">
          <div className="stat-icon"><i data-lucide="indian-rupee"></i></div>
          <div className="stat-content">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">₹{invoices.filter(i => i.status === 'Paid').reduce((acc, i) => acc + Number(i.total), 0).toFixed(2)}</div>
          </div>
        </Card>
`;
const revStatNew = `
        <Card className="stat-card">
          <div className="stat-icon"><i data-lucide="indian-rupee"></i></div>
          <div className="stat-content">
            <div className="stat-label">Revenue (This Month)</div>
            <div className="stat-value">₹{revenueThisMonth.toFixed(2)}</div>
            <div style={{ fontSize: '0.85rem', color: growth >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
                {growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}% vs last month
            </div>
          </div>
        </Card>
`;
appJsx = appJsx.replace(revStatOld.trim(), revStatNew.trim());

const chartUI = `
      <div className="dashboard-grid-2" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap: '24px', marginTop: '24px' }}>
          <Card>
              <h3 className="mb-4">Revenue Overview</h3>
              <canvas ref={chartRef} style={{ width: '100%', maxHeight: '300px' }}></canvas>
          </Card>
          
          <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>Recent Activity</h3>
                  <a style={{ color: 'var(--primary-color)', fontSize: '0.9rem', cursor: 'pointer' }}>View All</a>
              </div>
              <div className="activity-list">
                  {invoices.slice(0, 4).map(inv => (
                      <div key={inv.id} className="activity-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <div>
                              <div style={{ fontWeight: 500 }}>{inv.clientName}</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inv.invoiceNo}</div>
                          </div>
                          <div style={{ fontWeight: 600 }}>₹{inv.total}</div>
                      </div>
                  ))}
              </div>
          </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 }}>
`;
appJsx = appJsx.replace(`<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 }}>`, chartUI);

// 3. Update Status Badges to show Overdue
const tBodyTarget = `
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>No invoices created yet.</td></tr>
                ) : invoices.map(inv => (
                  <tr key={inv.id}>
`;
const tBodyReplacement = `
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>No invoices created yet.</td></tr>
                ) : invoices.map(inv => {
                  const isOverdue = inv.status !== 'Paid' && inv.dueDate && new Date(inv.dueDate).getTime() < todayScore;
                  const daysOverdue = isOverdue ? Math.floor((todayScore - new Date(inv.dueDate).getTime()) / (1000 * 3600 * 24)) : 0;
                  return (
                  <tr key={inv.id} style={{ background: isOverdue ? 'rgba(253, 79, 89, 0.05)' : 'transparent' }}>
                    <td><span style={{ fontWeight: 600 }}>{inv.invoiceNo}</span><br/><span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inv.invoiceDate}</span></td>
                    <td>{inv.clientName}</td>
                    <td>₹{Number(inv.total).toFixed(2)}</td>
                    <td>
                        <span className={\`status-badge \${inv.status}\`}>{inv.status}</span>
                        {isOverdue && <span style={{display:'inline-block', marginLeft:8, fontSize:'0.75rem', color:'var(--danger)', fontWeight:600}}>({daysOverdue} days overdue)</span>}
                    </td>
`;
appJsx = appJsx.replace(tBodyTarget.trim(), tBodyReplacement.trim());
appJsx = appJsx.replace(`<td><span className={\`status-badge \${inv.status}\`}>{inv.status}</span></td>`, '');
appJsx = appJsx.replace(`</trkey={inv.id}`, ''); // cleanup artifact
appJsx = appJsx.replace(/<tr key=\{inv\.id\}>\s*<td><span style=\{\{ fontWeight: 600 \}\}>\{inv\.invoiceNo\}/, (m) => `\n${m}`);


// 4. Update CreateInvoice to use AutoFill and Templates
const handleDateChangeTarget = `
  const handleDateChange = (field, value) => {
     setInvoice({ ...invoice, [field]: value });
  };
`;
const handleDateChangeReplacement = `
  const handleDateChange = (field, value) => {
     let updates = { [field]: value };
     if (field === 'invoiceDate' && settings.paymentTermsDays) {
         const d = new Date(value);
         d.setDate(d.getDate() + settings.paymentTermsDays);
         updates.dueDate = d.toISOString().split('T')[0];
     }
     setInvoice({ ...invoice, ...updates });
  };
`;
appJsx = appJsx.replace(handleDateChangeTarget.trim(), handleDateChangeReplacement.trim());

const addServiceTemplateTarget = `
  const addService = () => setInvoice({ ...invoice, services: [...invoice.services, { desc: '', qty: 1, rate: 0, amount: 0 }] });
`;
const addServiceTemplateReplacement = `
  const addService = () => setInvoice({ ...invoice, services: [...invoice.services, { desc: '', qty: 1, rate: 0, amount: 0 }] });
  
  const applyTemplate = (e) => {
      if(!e.target.value) return;
      try {
         const tpl = JSON.parse(e.target.value);
         const srv = { desc: tpl.name, qty: 1, rate: tpl.price, amount: tpl.price };
         setInvoice({ ...invoice, services: [...invoice.services, srv] });
         e.target.value = ''; // reset dropdown
      } catch(ex) {}
  };
`;
appJsx = appJsx.replace(addServiceTemplateTarget.trim(), addServiceTemplateReplacement.trim());

const serviceHeaderTarget = `
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                     <h3 style={{ margin: 0 }}>Itemized Services</h3>
                     <Button onClick={addService} style={{ background: 'var(--primary-color)', color: 'white', border: 'none' }}>+ Add Item</Button>
                  </div>
`;
const serviceHeaderReplacement = `
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                     <h3 style={{ margin: 0 }}>Itemized Services</h3>
                     <div style={{ display: 'flex', gap: '12px' }}>
                         {(settings.serviceTemplates || []).length > 0 && (
                             <select className="form-input" style={{ width: 'auto', padding: '6px 12px' }} onChange={applyTemplate}>
                                 <option value="">Quick Add Package...</option>
                                 {(settings.serviceTemplates || []).map((tpl, i) => (
                                     <option key={i} value={JSON.stringify(tpl)}>{tpl.name} - ₹{tpl.price}</option>
                                 ))}
                             </select>
                         )}
                         <Button onClick={addService} className="btn-primary">+ Add Item</Button>
                     </div>
                  </div>
`;
appJsx = appJsx.replace(serviceHeaderTarget.trim(), serviceHeaderReplacement.trim());


// 5. Enhance Clients View (Recurring fields)
const clientStateTarget = `const [newClient, setNewClient] = useState({ name: '', business: '', email: '', phone: '', address: '' });`;
const clientStateReplacement = `const [newClient, setNewClient] = useState({ name: '', business: '', email: '', phone: '', address: '', isRecurring: false, recurringAmount: 500 });`;
appJsx = appJsx.replace(clientStateTarget, clientStateReplacement);

const clientFormTarget = `<Button onClick={handleAddClient} style={{ gridColumn: '1 / -1', background: 'var(--primary-color)', color: 'white' }}>Save Client Data</Button>`;
const clientFormReplacement = `
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', padding: '16px', background: 'var(--bg-color)', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={newClient.isRecurring} onChange={e => setNewClient({...newClient, isRecurring: e.target.checked})} style={{ width: 18, height: 18 }} />
                  Recurring Client (Auto-Bill)
              </label>
              {newClient.isRecurring && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Monthly Charge (₹)</span>
                      <input type="number" min="0" className="form-input" style={{ width: '150px' }} value={newClient.recurringAmount} onChange={e => setNewClient({...newClient, recurringAmount: Number(e.target.value)})} />
                  </div>
              )}
          </div>
          <Button onClick={handleAddClient} className="btn-primary" style={{ gridColumn: '1 / -1' }}>Save Client Profile</Button>
`;
appJsx = appJsx.replace(clientFormTarget, clientFormReplacement);

const clientTableTarget = `<th>Actions</th>
              </tr>`;
const clientTableReplacement = `
                  <th>Recurring</th>
                  <th>Actions</th>
              </tr>`;
appJsx = appJsx.replace(clientTableTarget, clientTableReplacement);

const clientTableRowTarget = `<td>
                     <Button className="btn-icon" onClick={() => handleEditClient(client)}><i data-lucide="edit"></i></Button>
                     <Button className="btn-icon" onClick={() => deleteClient(client.id)} style={{ color: 'var(--danger)' }}><i data-lucide="trash-2"></i></Button>
                  </td>`;
const clientTableRowReplacement = `
                  <td>{client.isRecurring ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>Active (₹{client.recurringAmount})</span> : '-'}</td>
                  <td>
                     <Button className="btn-icon" onClick={() => handleEditClient(client)}><i data-lucide="edit"></i></Button>
                     <Button className="btn-icon" onClick={() => deleteClient(client.id)} style={{ color: 'var(--danger)' }}><i data-lucide="trash-2"></i></Button>
                  </td>`;
appJsx = appJsx.replace(clientTableRowTarget, clientTableRowReplacement);


// 6. Settings Updates (Payment config, Export tools, Templates)
const settingsStartTarget = `const SettingsView = () => {`;
const settingsStartReplacement = `const SettingsView = () => {
    const { settings, saveSettings, exportData, exportCSV } = useContext(AppContext);
    const [newTpl, setNewTpl] = useState({ name: '', price: '' });
    
    const handleAddTpl = () => {
        if(!newTpl.name || !newTpl.price) return;
        const updated = [...(settings.serviceTemplates || []), { name: newTpl.name, price: Number(newTpl.price) }];
        saveSettings({ ...settings, serviceTemplates: updated });
        setNewTpl({ name: '', price: '' });
    };
    const removeTpl = (i) => {
        const updated = (settings.serviceTemplates || []).filter((_, idx) => idx !== i);
        saveSettings({ ...settings, serviceTemplates: updated });
    };
`;
appJsx = appJsx.replace(`const SettingsView = () => {\n   const { settings, saveSettings } = useContext(AppContext);`, settingsStartReplacement);

const settingsConfigTarget = `<h3 className="mb-4">Invoice Preferences</h3>`;
const settingsConfigReplacement = `
            <Card>
                <h3 className="mb-4">Automation & Presets</h3>
                <div style={{ marginBottom: '24px' }}>
                    <label className="form-label">Default Payment Terms (Days)</label>
                    <select className="form-input" value={settings.paymentTermsDays || 7} onChange={e => handleSettingsChange('paymentTermsDays', Number(e.target.value))}>
                        <option value="0">Due on Receipt (0 Days)</option>
                        <option value="7">Net 7 Days</option>
                        <option value="15">Net 15 Days</option>
                        <option value="30">Net 30 Days</option>
                        <option value="45">Net 45 Days</option>
                    </select>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Invoice Due Date will be auto-calculated.</p>
                </div>
                
                <div>
                    <label className="form-label" style={{ marginBottom: 12 }}>Service Catalog (1-Click Templates)</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <Input placeholder="Service Name (e.g. Server Maintenance)" value={newTpl.name} onChange={e => setNewTpl({...newTpl, name: e.target.value})} style={{ flex: 1 }} />
                        <Input type="number" placeholder="Price (₹)" value={newTpl.price} onChange={e => setNewTpl({...newTpl, price: e.target.value})} style={{ width: 120 }} />
                        <Button onClick={handleAddTpl} className="btn-primary" style={{ height: 44 }}>Add</Button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(settings.serviceTemplates || []).map((tpl, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-color)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontWeight: 500 }}>{tpl.name}</span>
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <span style={{ fontWeight: 600 }}>₹{tpl.price}</span>
                                    <i data-lucide="x" style={{ cursor: 'pointer', color: 'var(--danger)', width: 18 }} onClick={() => removeTpl(i)}></i>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            <Card style={{ gridColumn: '1 / -1' }}>
                <h3 className="mb-4">Data Management</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Backup your data locally or export your invoice records to Excel/Sheets.</p>
                <div style={{ display: 'flex', gap: 16 }}>
                    <Button onClick={exportCSV} className="btn-secondary" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                         <i data-lucide="file-spreadsheet"></i> Export Invoices (CSV)
                    </Button>
                    <Button onClick={exportData} className="btn-secondary" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                         <i data-lucide="download-cloud"></i> Download Full Backup
                    </Button>
                </div>
            </Card>

           <Card style={{ gridColumn: '1 / -1' }}>
               <h3 className="mb-4">Invoice Preferences</h3>
`;
appJsx = appJsx.replace(`<Card>\n           <h3 className="mb-4">Invoice Preferences</h3>`, settingsConfigReplacement);

fs.writeFileSync('public/app.jsx', appJsx);
console.log('App patched with Power Features successfully!');
