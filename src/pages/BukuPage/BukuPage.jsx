import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Tag, Button, Modal, Input, Space, Typography, Row, Col, Tabs, Menu, Dropdown,
    message, Tooltip, Empty, Grid, DatePicker, Spin, Divider, App
} from 'antd';
import {
    PlusOutlined, EditOutlined, HistoryOutlined, ContainerOutlined, PrinterOutlined,
    PullRequestOutlined, ReadOutlined, EyeOutlined
} from '@ant-design/icons';

// Sesuaikan path dan pastikan nama file tetap BukuForm.jsx, dll.
import BulkRestockModal from './components/BulkRestockModal';
import PdfPreviewModal from './components/PdfPreviewModal';
import BukuTableComponent from './components/BukuTable';
import BukuForm from './components/BukuForm';
import StokFormModal from './components/StockFormModal';
import StokHistoryTab from './components/StokHistoryTab';
import useBukuData from '../../hooks/useBukuData'; // Akan berfungsi sebagai usePlateData
import useDebounce from '../../hooks/useDebounce';
import {
    currencyFormatter, numberFormatter, percentFormatter, generateFilters
} from '../../utils/formatters';
import { generateBukuPdfBlob } from '../../utils/pdfBuku'; // Akan dirender sebagai generatePlatePdfBlob

const { Content } = Layout;
const { Title } = Typography;
const { TabPane } = Tabs;

const BukuPage = () => {
    const { data: plateData, loading: initialLoading } = useBukuData();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStokModalOpen, setIsStokModalOpen] = useState(false);
    const [isBulkRestockModalOpen, setIsBulkRestockModalOpen] = useState(false);
    const [editingPlate, setEditingPlate] = useState(null);
    const [stokPlate, setStokPlate] = useState(null);
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const screens = Grid.useBreakpoint();
    const [columnFilters, setColumnFilters] = useState({});

    // --- Pagination ---
    const showTotalPagination = useCallback((total, range) => {
        const totalJenis = plateData.length;
        return `${range[0]}-${range[1]} dari ${total} entri (Total Jenis Plate: ${numberFormatter(totalJenis)})`;
    }, [plateData.length]);

    const [pagination, setPagination] = useState(() => ({
        current: 1,
        pageSize: 15,
        pageSizeOptions: ['15', '50', '100', '200'],
        showSizeChanger: true,
        showTotal: showTotalPagination,
    }));

    // --- PDF State ---
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [pdfFileName, setPdfFileName] = useState("daftar_plate.pdf");

    // --- Defer Search Text & Filtering State ---
    const deferredDebouncedSearchText = useDeferredValue(debouncedSearchText);
    const isFiltering = debouncedSearchText !== deferredDebouncedSearchText;

    // --- Filter Plat & Generate Filter Options ---
    const filteredPlate = useMemo(() => {
        let processedData = [...plateData];
        processedData.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (!deferredDebouncedSearchText) {
            return processedData;
        }

        const lowerSearch = deferredDebouncedSearchText.toLowerCase();
        return processedData.filter(plate =>
            (plate.judul || '').toLowerCase().includes(lowerSearch) ||
            (plate.kode_plate || '').toLowerCase().includes(lowerSearch) ||
            (plate.merek || '').toLowerCase().includes(lowerSearch) // Ganti penerbit ke merek untuk search
        );
    }, [plateData, deferredDebouncedSearchText]);

    // Hanya generate filters untuk 'merek' karena itu satu-satunya kolom filter yang tersisa
    const merekFilters = useMemo(() => generateFilters(plateData, 'merek'), [plateData]);


    // --- Kalkulasi Summary dipindah ke useMemo ---
    const summaryData = useMemo(() => {
        if (initialLoading || !filteredPlate || filteredPlate.length === 0) {
            return { totalStok: 0, totalAsset: 0, totalAssetNet: 0, totalAssetHrgBeli: 0 };
        }
        const { totalStok, totalAsset, totalAssetNet, totalAssetHrgBeli } = filteredPlate.reduce((acc, item) => {
            const stok = Number(item.stok) || 0;
            const hargaJual = Number(item.hargaJual) || 0;
            const hargaBeli = Number(item.hargaBeli) || 0;
            const diskon = Number(item.diskonJual) || 0;
            const diskonSpesial = Number(item.diskonJualSpesial) || 0;

            let hargaNet = hargaJual;
            if (diskon > 0) hargaNet = hargaNet * (1 - diskon / 100);
            if (diskonSpesial > 0) hargaNet = hargaNet * (1 - diskonSpesial / 100);

            acc.totalStok += stok;
            acc.totalAsset += stok * hargaJual;
            acc.totalAssetNet += stok * hargaNet;
            acc.totalAssetHrgBeli += stok * hargaBeli;
            return acc;
        }, { totalStok: 0, totalAsset: 0, totalAssetNet: 0, totalAssetHrgBeli: 0 });

        return { totalStok, totalAsset, totalAssetNet, totalAssetHrgBeli };
    }, [filteredPlate, initialLoading]);

    // --- Efek Reset Pagination ---
    useEffect(() => {
        setPagination(prev => ({ ...prev, current: 1 }));
        setColumnFilters({}); // Reset filter kolom saat search berubah
    }, [debouncedSearchText]);

    // --- Handle Table Change ---
    const handleTableChange = useCallback((paginationConfig, filters, sorter, extra) => {
        setPagination(paginationConfig);
        setColumnFilters(filters);
    }, []);

    // --- Handler Modals ---
    const handleTambah = useCallback(() => { setEditingPlate(null); setIsModalOpen(true); }, []);
    const handleEdit = useCallback((record) => { setEditingPlate(record); setIsModalOpen(true); }, []);
    const handleTambahStok = useCallback((record) => { setStokPlate(record); setIsStokModalOpen(true); }, []);
    const handleCloseModal = useCallback(() => { setIsModalOpen(false); setEditingPlate(null); }, []);
    const handleCloseStokModal = useCallback(() => { setIsStokModalOpen(false); setStokPlate(null); }, []);
    const handleOpenBulkRestockModal = useCallback(() => {
        if (!plateData || plateData.length === 0) { message.warn("Data plate belum dimuat."); return; } setIsBulkRestockModalOpen(true);
    }, [plateData]);
    const handleCloseBulkRestockModal = useCallback(() => { setIsBulkRestockModalOpen(false); }, []);

    // --- Handler PDF ---
    const handleGenerateAndShowPdf = useCallback(async () => {
        const dataToExport = filteredPlate;
        if (!dataToExport?.length) { message.warn('Tidak ada data untuk PDF.'); return; } setIsGeneratingPdf(true); message.loading({ content: 'Membuat PDF...', key: 'pdfgen', duration: 0 }); setTimeout(async () => { try { if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
            const pdfBlob = generateBukuPdfBlob(dataToExport); // Akan diubah namanya di utils
            if (!pdfBlob || !(pdfBlob instanceof Blob) || pdfBlob.size === 0) { throw new Error("Gagal membuat PDF."); } const url = URL.createObjectURL(pdfBlob); setPdfFileName(`Daftar_Stok_Plate_${Date.now()}.pdf`);
            setPdfPreviewUrl(url); setIsPreviewModalVisible(true); message.success({ content: 'PDF siap!', key: 'pdfgen', duration: 2 }); } catch (error) { console.error('PDF error:', error); message.error({ content: `Gagal membuat PDF: ${error.message}`, key: 'pdfgen', duration: 5 }); } finally { setIsGeneratingPdf(false); } }, 50);
    }, [filteredPlate, pdfPreviewUrl]);
    const handleClosePreviewModal = useCallback(() => {
        setIsPreviewModalVisible(false); if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
    }, [pdfPreviewUrl]);

    // --- Kolom Tabel (DISESUAIKAN) ---
    const renderAksi = useCallback((_, record) => (
        <Space size="small">
            <Tooltip title="Edit Detail Plate"> <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} /> </Tooltip>
            <Tooltip title="Tambah/Kurangi Stok"> <Button type="link" icon={<HistoryOutlined />} onClick={() => handleTambahStok(record)} /> </Tooltip>
        </Space>
    ), [handleEdit, handleTambahStok]);

    const columns = useMemo(() => [
        { title: 'No', dataIndex: 'nomor', key: 'nomor', width: 60, render: (_, __, index) => pagination.pageSize * (pagination.current - 1) + index + 1, fixed: 'left' },
        { title: 'Kode Plate', dataIndex: 'kode_plate', key: 'kode_plate', width: 130, sorter: (a, b) => (a.kode_plate || '').localeCompare(b.kode_plate || '') },
        { title: 'Judul Plate', dataIndex: 'judul', key: 'judul', width: 250, sorter: (a, b) => (a.judul || '').localeCompare(b.judul || '') },
        { title: 'Ukuran', dataIndex: 'ukuran', key: 'ukuran', width: 100, sorter: (a, b) => (a.ukuran || '').localeCompare(b.ukuran || '') },
        { title: 'Stok', dataIndex: 'stok', key: 'stok', align: 'right', width: 100, render: numberFormatter, sorter: (a, b) => (Number(a.stok) || 0) - (Number(b.stok) || 0) },
        { title: 'Hrg. Beli', dataIndex: 'hargaBeli', key: 'hargaBeli', align: 'right', width: 150, render: currencyFormatter, sorter: (a, b) => (Number(a.hargaBeli) || 0) - (Number(b.hargaBeli) || 0) },
        { title: 'Hrg. Jual', dataIndex: 'hargaJual', key: 'hargaJual', align: 'right', width: 150, render: currencyFormatter, sorter: (a, b) => (Number(a.hargaJual) || 0) - (Number(b.hargaJual) || 0) },
        { title: 'Merek', dataIndex: 'merek', key: 'merek', width: 150, filters: merekFilters, filteredValue: columnFilters.merek || null, onFilter: (v, r) => r.merek === v }, // Kolom Merek
        { title: 'Aksi', key: 'aksi', align: 'center', width: 100, render: renderAksi, fixed: screens.md ? 'right' : false },
    ], [
        merekFilters, columnFilters, renderAksi, screens.md, pagination.pageSize, pagination.current,
    ]);

    const tableScrollX = useMemo(() => columns.reduce((acc, col) => acc + (col.width || 150), 0), [columns]);

    // PDF Menu
    const pdfActionMenu = (
        <Menu>
            <Menu.Item key="previewPdf" icon={<EyeOutlined />} onClick={handleGenerateAndShowPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? 'Membuat PDF...' : 'Pratinjau PDF'}
            </Menu.Item>
        </Menu>
    );

    // Row Class Name
    const getRowClassName = useCallback((record, index) => {
        return index % 2 === 1 ? 'ant-table-row-odd' : '';
    }, []);

    // --- Render ---
    return (
        <Content style={{ padding: screens.xs ? '12px' : '24px' }}>
            <Tabs defaultActiveKey="1" type="card">
                <TabPane tab={<Space><ReadOutlined /> Manajemen Plate</Space>} key="1">
                    <Spin spinning={isFiltering} tip="Memfilter data...">
                        <Card>
                            <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                                <Col lg={6} md={8} sm={24} xs={24}>
                                    <Title level={5} style={{ margin: 0 }}>Manajemen Data Plate</Title>
                                </Col>
                                <Col lg={18} md={16} sm={24} xs={24}>
                                    <Space direction={screens.xs ? 'vertical' : 'horizontal'}
                                        style={{ width: '100%', alignItems: screens.xs ? 'start' : 'end', justifyContent: screens.xs ? 'start' : 'end' }}>

                                        <Input.Search
                                            placeholder="Cari Judul, Kode, Merek..." // Diubah untuk mencakup Merek
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            allowClear
                                            style={{ width: screens.xs ? '100%' : 250 }}
                                            enterButton
                                        />

                                        <Space wrap style={{ width: screens.xs ? '100%' : 'auto', justifyContent: screens.xs ? 'flex-start' : 'flex-end' }}>
                                            <Dropdown overlay={pdfActionMenu} placement="bottomRight">
                                                <Button icon={<PrinterOutlined />}>Opsi PDF</Button>
                                            </Dropdown>
                                            <Button icon={<ContainerOutlined />} onClick={handleOpenBulkRestockModal} disabled={initialLoading || plateData.length === 0}>
                                                {screens.xs ? 'Restock' : 'Restock Borongan'}
                                            </Button>
                                            <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} disabled={initialLoading}>
                                                Tambah Plate
                                            </Button>
                                        </Space>
                                    </Space>
                                </Col>
                            </Row>

                            <BukuTableComponent
                                columns={columns}
                                dataSource={filteredPlate}
                                loading={initialLoading || isFiltering}
                                isCalculating={initialLoading}
                                pagination={pagination}
                                summaryData={summaryData}
                                handleTableChange={handleTableChange}
                                tableScrollX={tableScrollX}
                                rowClassName={getRowClassName}
                            />
                        </Card>
                    </Spin>
                </TabPane>

                <TabPane tab={<Space><PullRequestOutlined /> Riwayat Stok</Space>} key="2">
                    <StokHistoryTab />
                </TabPane>
            </Tabs>

            {/* --- Modal --- */}
            {isModalOpen && <BukuForm open={isModalOpen} onCancel={handleCloseModal} initialValues={editingPlate} />}
            {isStokModalOpen && <StokFormModal open={isStokModalOpen} onCancel={handleCloseStokModal} plate={stokPlate} />}
            {isPreviewModalVisible && <PdfPreviewModal
                visible={isPreviewModalVisible}
                onClose={handleClosePreviewModal}
                pdfBlobUrl={pdfPreviewUrl}
                fileName={pdfFileName}
            />}
            {isBulkRestockModalOpen && (
                <BulkRestockModal
                    open={isBulkRestockModalOpen}
                    onClose={handleCloseBulkRestockModal}
                    plateList={plateData}
                />
            )}
        </Content>
    );
};

export default BukuPage;