import React from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Home, 
  FileText, 
  MessageSquare, 
  BarChart3, 
  Video, 
  Calendar, 
  Users, 
  DollarSign, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert,
  Settings,
  LogOut,
  X,
  Key
} from "lucide-react";

/**
 * Sidebar Component: Handles main navigation and institute branding.
 * Hardened with defensive checks for stats and tenantData.
 */
const Sidebar = ({ 
  isSuperAdmin, 
  allTenants = [], 
  isSidebarOpen, 
  setIsSidebarOpen, 
  tenantData = {}, 
  activeTab, 
  setActiveTab, 
  stats = {}, 
  cancelEdit, 
  signOut, 
  auth 
}) => {
  const navSections = [
    {
      label: "Main",
      items: [
        { id: 'dashboard', label: "Dashboard", icon: LayoutDashboard },
      ]
    },
    {
      label: "Learning Content",
      items: [
        { id: 'lectures', label: "Lectures", icon: BookOpen, badge: "AI" },
        { id: 'homework', label: "Homework", icon: Home },
        { id: 'exams', label: "Exams", icon: FileText, badge: "AI" },
      ]
    },
    {
      label: "Student Engagement",
      items: [
        { id: 'doubts', label: "Doubts", icon: MessageSquare, badge: (stats?.pendingDoubts > 0) ? stats.pendingDoubts : "AI", badgeType: (stats?.pendingDoubts > 0) ? 'danger' : 'info' },
        { id: 'polls', label: "Live Polls", icon: BarChart3 },
        { id: 'live', label: "Live Lecture", icon: Video },
        { id: 'attendance', label: "Attendance", icon: Calendar },
      ]
    },
    {
      label: "Management",
      items: [
        { id: 'students', label: "Students", icon: Users, badge: (stats?.pendingStudents > 0) ? stats.pendingStudents : null, badgeType: 'primary' },
        { id: 'password_resets', label: "Password Resets", icon: Key, badge: (stats?.passwordResets > 0) ? stats.passwordResets : null, badgeType: 'warning' },
        { id: 'fees', label: "Fees", icon: DollarSign },
        { id: 'deletion', label: "Security", icon: AlertTriangle, badge: (stats?.deletionRequests > 0) ? stats.deletionRequests : null, badgeType: 'danger' },
        { id: 'settings', label: "Institute Settings", icon: Settings },
      ]
    }
  ];

  if (isSuperAdmin) {
    const pendingTenantsCount = allTenants.filter(t => t.status === 'PENDING_APPROVAL').length;
    navSections.push({
      label: "Super Admin",
      items: [
        { 
          id: 'superadmin', 
          label: "Control Center", 
          icon: ShieldCheck, 
          badge: pendingTenantsCount > 0 ? pendingTenantsCount : null,
          badgeType: 'warning'
        },
        { 
          id: 'integrity', 
          label: "Data Integrity", 
          icon: ShieldAlert, 
        }
      ]
    });
  }

  return (
    <>
      <div className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`} onClick={() => setIsSidebarOpen?.(false)}></div>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {tenantData?.logoUrl ? (
              <img src={tenantData.logoUrl} alt="Logo" style={{ width: '42px', height: '42px', borderRadius: '12px', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-gradient)', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.2)' }}>
                <ShieldCheck color="white" size={24} />
              </div>
            )}
            <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{tenantData?.name || "Midnight"}</span>
          </div>
          <button 
            className="btn btn-ghost menu-close hide-desktop" 
            onClick={() => setIsSidebarOpen?.(false)}
            style={{ padding: '8px' }}
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {navSections.map(section => (
            <div key={section.label} className="nav-group">
              <div className="nav-label">{section.label}</div>
              {section.items.map(item => (
                <button 
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`} 
                  onClick={() => { setActiveTab?.(item.id); setIsSidebarOpen?.(false); cancelEdit?.(); }}
                >
                  <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`badge ${item.badgeType === 'danger' ? 'badge-danger' : item.badgeType === 'warning' ? 'badge-warning' : item.badgeType === 'primary' ? 'badge-primary' : ''}`} style={{ 
                      marginLeft: 'auto', 
                      fontSize: '10px', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      background: !item.badgeType ? 'rgba(139, 92, 246, 0.2)' : undefined,
                      color: !item.badgeType ? '#a78bfa' : undefined
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <button className="nav-item" onClick={() => signOut?.(auth)} style={{ color: 'var(--danger)', opacity: 0.8 }}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
