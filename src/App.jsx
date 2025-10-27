import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Layout, ConfigProvider, Drawer, Grid, Typography, App as AntApp, Button } from 'antd';
import idID from 'antd/locale/id_ID';
import 'dayjs/locale/id';
import { CloseOutlined, LogoutOutlined } from '@ant-design/icons';

// --- Context and Auth Components ---
import { AuthProvider, useAuth } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';

// --- Komponen Layout ---
import SideMenu, { NavigationMenu } from './components/layout/SideMenu';
import MobileHeader from './components/layout/MobileHeader';

// --- Halaman Aplikasi ---
import BukuPage from './pages/BukuPage/BukuPage';
import MutasiPage from './pages/MutasiPage/MutasiPage';
import TransaksiJualPage from './pages/TransaksiJualPage/TransaksiJualPage';
import PelangganPage from './pages/PelangganPage/PelangganPage';
import LoginPage from './pages/LoginPage/LoginPage';

// --- Halaman Publik ---
import InvoicePublicPage from './pages/InvoicePublicPage';
import NotaPublicPage from './pages/NotaPublicPage';

// --- (BARU) Impor Halaman Generate ---
import GBukuPage from './pages/GBukuPage';
import GMutasiPage from './pages/GMutasiPage';
import GJualPage from './pages/GJualPage';

// Komponen MainLayout (Add Logout Button)
const MainLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const screens = Grid.useBreakpoint();
    const location = useLocation(); // OK, karena MainLayout akan dirender di dalam <BrowserRouter>
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const { message: antdMessage } = AntApp.useApp();

    const handleDrawerClose = () => setDrawerVisible(false);
    const handleMenuClick = () => setDrawerVisible(true);

    const handleLogout = async () => {
        try {
            await logout();
            console.log("Pengguna logout");
            antdMessage.success("Logout berhasil.");
            navigate('/login', { replace: true });
        } catch (error) {
            console.error("Gagal logout:", error);
            antdMessage.error("Gagal logout.");
        }
    };

    // --- (UPDATE) getActiveKey ---
    const getActiveKey = () => {
        const path = location.pathname;
        if (path.startsWith('/plate')) return '/plate';
        if (path.startsWith('/mutasi')) return '/mutasi';
        if (path.startsWith('/transaksi-jual')) return '/transaksi-jual';
        if (path.startsWith('/pelanggan')) return '/pelanggan';
        if (path.startsWith('/gplate')) return '/gplate';
        if (path.startsWith('/gmutasi')) return '/gmutasi';
        if (path.startsWith('/gjual')) return '/gjual';
        return '/mutasi'; // Default
    };

    // --- (BARU) useEffect untuk mengubah document.title ---
    useEffect(() => {
        let title = "Aplikasi Admin"; // Default title
        const appName = "Sistem Admin Plat"; // Nama aplikasi untuk awalan

        // Map path ke judul yang lebih deskriptif
        switch (location.pathname) {
            case '/plate':
                title = `${appName} - Manajemen Plat`;
                break;
            case '/mutasi':
                title = `${appName} - Mutasi Stok`;
                break;
            case '/transaksi-jual':
                title = `${appName} - Transaksi Penjualan`;
                break;
            case '/pelanggan':
                title = `${appName} - Data Pelanggan`;
                break;
            case '/gplate':
                title = `${appName} - Generate Plat`;
                break;
            case '/gmutasi':
                title = `${appName} - Generate Mutasi`;
                break;
            case '/gjual':
                title = `${appName} - Generate Penjualan`;
                break;
            case '/login': // Login juga bisa diatur di sini
                title = `${appName} - Login`;
                break;
            case '/':
                title = `${appName} - Dashboard`; // Untuk rute default '/'
                break;
            // Untuk rute publik, gunakan pola Regex jika perlu
            case location.pathname.match(/\/transaksijualplate\/invoice\/\w+/)?.[0]: // Sesuaikan regex jika ID bukan hanya angka
                title = `${appName} - Detail Invoice`;
                break;
            case location.pathname.match(/\/transaksijualplate\/nota\/\w+/)?.[0]:
                title = `${appName} - Detail Nota`;
                break;
            default:
                title = `${appName} - Dashboard`; // Fallback jika tidak ada yang cocok
                break;
        }
        document.title = title;
    }, [location.pathname]);


    const contentMarginLeft = collapsed ? 80 : 240;

    return (
        <Layout>
            {screens.lg ? (
                <SideMenu
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    activeKey={getActiveKey()}
                    onLogout={handleLogout}
                    userEmail={currentUser?.email}
                />
            ) : (
                <Drawer
                    title={<Typography.Text style={{ color: 'white' }}>Menu Navigasi</Typography.Text>}
                    placement="left"
                    onClose={handleDrawerClose}
                    open={drawerVisible}
                    headerStyle={{ backgroundColor: '#001529', borderBottom: 0 }}
                    bodyStyle={{ padding: 0, backgroundColor: '#001529' }}
                    closeIcon={<CloseOutlined style={{ color: 'white' }} />}
                    footer={
                        <Button
                            type="primary"
                            danger
                            icon={<LogoutOutlined />}
                            onClick={handleLogout}
                            style={{ width: '100%' }}
                        >
                            Logout ({currentUser?.email?.split('@')[0]})
                        </Button>
                    }
                    footerStyle={{ backgroundColor: '#001529', borderTop: '1px solid #1f1f1f', padding: '10px 16px' }}
                >
                    <NavigationMenu activeKey={getActiveKey()} onLinkClick={handleDrawerClose} />
                </Drawer>
            )}
            <Layout
                style={{
                    marginLeft: screens.lg ? contentMarginLeft : 0,
                    transition: 'margin-left 0.2s',
                    minHeight: '100vh',
                }}
            >
                {!screens.lg && <MobileHeader onMenuClick={handleMenuClick} />}
                {/* Routes untuk aplikasi utama */}
                <Routes>
                    <Route path="/plate" element={<BukuPage />} />
                    <Route path="/mutasi" element={<MutasiPage />} />
                    <Route path="/transaksi-jual" element={<TransaksiJualPage />} />
                    <Route path="/pelanggan" element={<PelangganPage />} />
                    <Route path="/gplate" element={<GBukuPage />} />
                    <Route path="/gmutasi" element={<GMutasiPage />} />
                    <Route path="/gjual" element={<GJualPage />} />
                    <Route path="/" element={<Navigate to="/mutasi" replace />} />
                    <Route path="*" element={<Navigate to="/mutasi" replace />} />
                </Routes>
            </Layout>
        </Layout>
    );
};

// Komponen AppRoutes sekarang tidak perlu useLocation
const AppRoutes = () => {
    return (
        <Routes>
            {/* Rute Login */}
            <Route path="/login" element={<LoginPage />} />
            {/* Rute Publik */}
            <Route path="/transaksijualplate/invoice/:id" element={<InvoicePublicPage />} />
            <Route path="/transaksijualplate/nota/:id" element={<NotaPublicPage />} />
            {/* Rute Internal yang Dilindungi */}
            <Route
                path="/*" // Mencocokkan semua path lain (rute internal)
                element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
};

const App = () => {
    return (
        <ConfigProvider locale={idID}>
            <AntApp>
                <AuthProvider>
                    {/* <BrowserRouter> DITEMPATKAN DI SINI */}
                    <BrowserRouter>
                        <AppRoutes /> {/* AppRoutes sekarang berada di dalam BrowserRouter */}
                    </BrowserRouter>
                </AuthProvider>
            </AntApp>
        </ConfigProvider>
    );
};

export default App;