import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Modal, Input, Space, Typography, Row, Col, Tabs, 
    message, Tooltip, Empty, Grid, DatePicker, Spin, Divider, App 
    // --- Tag & percentFormatter dihapus (tidak terpakai) ---
} from 'antd';
import {
    PlusOutlined, EditOutlined, HistoryOutlined, ContainerOutlined, PrinterOutlined,
    PullRequestOutlined, ReadOutlined
} from '@ant-design/icons';

import BulkRestockModal from './components/BulkRestockModal';
import PdfPreviewModal from './components/PdfPreviewModal';
import BukuTableComponent from './components/BukuTable';
import BukuForm from './components/BukuForm';
import StokFormModal from './components/StockFormModal';
import StokHistoryTab from './components/StokHistoryTab';
import useBukuData from '../../hooks/useBukuData'; // <-- Hook ini tetap, diasumsikan mengambil data plate
import useDebounce from '../../hooks/useDebounce';
import {
    currencyFormatter, numberFormatter, generateFilters
    // --- percentFormatter dihapus ---
} from '../../utils/formatters';
// --- Path PDF disarankan diganti ke yang lebih generik ---
 import { generateBukuPdfBlob } from '../../utils/pdfBuku'; // <-- PERHATIKAN: Fungsi ini harus diupdate agar bisa memproses data 'plate'
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title } = Typography;
const { TabPane } = Tabs;

const BukuPage = () => {
    // --- State ---
    // --- MODIFIKASI: 'bukuList' diganti nama menjadi 'plateList' untuk kejelasan ---
    const { data: plateList, loading: initialLoading } = useBukuData(); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStokModalOpen, setIsStokModalOpen] = useState(false);
    const [isBulkRestockModalOpen, setIsBulkRestockModalOpen] = useState(false);
    // --- MODIFIKASI: State diganti untuk merefleksikan 'plate' ---
    const [editingPlate, setEditingPlate] = useState(null);
    const [stokPlate, setStokPlate] = useState(null);
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const screens = Grid.useBreakpoint();
    const [columnFilters, setColumnFilters] = useState({});

    const showTotalPagination = useCallback((total, range) => {
        const totalJenis = plateList?.length || 0; // <-- MODIFIKASI: pakai plateList
        return `${range[0]}-${range[1]} dari ${total} (Total ${numberFormatter(totalJenis)} Jenis)`;
    }, [plateList]); // <-- MODIFIKASI: pakai plateList

    const [pagination, setPagination] = useState(() => ({
        current: 1,
        pageSize: 25,
        pageSizeOptions: ['25', '50', '100', '200'],
        showSizeChanger: true,
        showTotal: showTotalPagination,
    }));

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [pdfFileName, setPdfFileName] = useState("daftar_plate.pdf");

    const deferredDebouncedSearchText = useDeferredValue(debouncedSearchText);
    const isFiltering = debouncedSearchText !== deferredDebouncedSearchText;

    // --- MODIFIKASI: Logika pencarian disesuaikan untuk 'plate' ---
    const searchedBuku = useMemo(() => {
        let processedData = [...plateList]; // <-- MODIFIKASI: pakai plateList
        processedData.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (!deferredDebouncedSearchText) return processedData;

        const lowerSearch = deferredDebouncedSearchText.toLowerCase();
        return processedData.filter(plate => // <-- MODIFIKASI: filter data plate
            (plate.kode_plate || '').toLowerCase().includes(lowerSearch) ||
            (plate.merek_plate || '').toLowerCase().includes(lowerSearch) ||
            (plate.ukuran_plate || '').toLowerCase().includes(lowerSearch)
        );
    }, [plateList, deferredDebouncedSearchText]); // <-- MODIFIKASI: pakai plateList

    // --- MODIFIKASI: Filter disederhanakan untuk 'plate' ---
    const merekFilters = useMemo(() => generateFilters(plateList, 'merek_plate'), [plateList]);
    // --- HAPUS: mapelFilters, kelasFilters, tahunTerbitFilters, peruntukanFilters, penerbitFilters, tipeBukuFilters ---

    // --- MODIFIKASI: Logika filter disederhanakan ---
    const dataForTable = useMemo(() => {
        let processedData = [...searchedBuku];
        const activeFilterKeys = Object.keys(columnFilters).filter(
            key => columnFilters[key] && columnFilters[key].length > 0
        );
        if (activeFilterKeys.length === 0) return processedData;

        for (const key of activeFilterKeys) {
            const filterValues = columnFilters[key];
            // --- MODIFIKASI: Hanya filter berdasarkan 'merek_plate' ---
            if (key === 'merek_plate') { 
                processedData = processedData.filter(item => {
                    const itemValue = item[key];
                    return filterValues.includes(itemValue);
                });
            }
        }
        return processedData;
    }, [searchedBuku, columnFilters]);


    // --- MODIFIKASI: Summary disederhanakan untuk 'plate' ---
    const summaryData = useMemo(() => {
        if (initialLoading || !dataForTable || dataForTable.length === 0) {
            // --- HAPUS: totalAssetNet ---
            return { totalStok: 0, totalAsset: 0, totalJudul: 0 };
        }
        // --- MODIFIKASI: Kalkulasi disederhanakan ---
        const { totalStok, totalAsset } = dataForTable.reduce((acc, item) => {
            const stok = Number(item.stok) || 0;
            const harga = Number(item.harga_plate) || 0; // <-- MODIFIKASI: pakai harga_plate
            // --- HAPUS: diskon & hargaNet ---

            acc.totalStok += stok;
            acc.totalAsset += stok * harga; // <-- MODIFIKASI: Aset = stok * harga_plate
            // --- HAPUS: totalAssetNet ---
            return acc;
        }, { totalStok: 0, totalAsset: 0 }); // <-- HAPUS: totalAssetNet

        // --- MODIFIKASI: Hapus totalAssetNet ---
        return { totalStok, totalAsset, totalJudul: dataForTable.length };
    }, [dataForTable, initialLoading]);

    useEffect(() => {
        setPagination(prev => ({ ...prev, current: 1 }));
        setColumnFilters({});
    }, [debouncedSearchText]);

    const handleTableChange = useCallback((paginationConfig, filters) => {
        setPagination(paginationConfig);
        setColumnFilters(filters);
    }, []);

    // --- MODIFIKASI: Handler menggunakan state 'plate' ---
    const handleTambah = useCallback(() => { setEditingPlate(null); setIsModalOpen(true); }, []);
    const handleEdit = useCallback((record) => { setEditingPlate(record); setIsModalOpen(true); }, []);
    const handleTambahStok = useCallback((record) => { setStokPlate(record); setIsStokModalOpen(true); }, []);
    const handleCloseModal = useCallback(() => { setIsModalOpen(false); setEditingPlate(null); }, []);
    const handleCloseStokModal = useCallback(() => { setIsStokModalOpen(false); setStokPlate(null); }, []);
    const handleOpenBulkRestockModal = useCallback(() => {
        if (!plateList || plateList.length === 0) { message.warn("Data plate belum dimuat."); return; } // <-- MODIFIKASI
        setIsBulkRestockModalOpen(true);
    }, [plateList]); // <-- MODIFIKASI
    const handleCloseBulkRestockModal = useCallback(() => { setIsBulkRestockModalOpen(false); }, []);

    // --- MODIFIKASI: Handler PDF disesuaikan ---
    const handleGenerateAndShowPdf = useCallback(async () => {
        const dataToExport = dataForTable;
        if (!dataToExport?.length) { message.warn('Tidak ada data untuk PDF.'); return; }
        setIsGeneratingPdf(true);
        message.loading({ content: 'Membuat PDF...', key: 'pdfgen', duration: 0 });
        setTimeout(async () => {
            try {
                if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
                // --- PENTING: Fungsi ini harus diupdate di file utils-nya ---
                const pdfBlob = generateBukuPdfBlob(dataToExport); 
                if (!pdfBlob || !(pdfBlob instanceof Blob) || pdfBlob.size === 0) { throw new Error("Gagal membuat PDF."); }
                const url = URL.createObjectURL(pdfBlob);
                // --- MODIFIKASI: Nama file PDF ---
                setPdfFileName(`Daftar_Stok_Plate_${dayjs().format('YYYYMMDD_HHmm')}.pdf`);
                setPdfPreviewUrl(url);
                setIsPreviewModalVisible(true);
                message.success({ content: 'PDF siap!', key: 'pdfgen', duration: 2 });
            } catch (error) {
                console.error('PDF error:', error);
                message.error({ content: `Gagal membuat PDF: ${error.message}`, key: 'pdfgen', duration: 5 });
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 50);
    }, [dataForTable, pdfPreviewUrl]);

    const handleClosePreviewModal = useCallback(() => {
        setIsPreviewModalVisible(false);
        if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
    }, [pdfPreviewUrl]);

    // --- MODIFIKASI: Tooltip pada Aksi ---
    const renderAksi = useCallback((_, record) => (
        <Space size="small">
            <Tooltip title="Edit Detail Plate"> 
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            </Tooltip>
            <Tooltip title="Tambah/Kurangi Stok">
                <Button type="link" icon={<HistoryOutlined />} onClick={() => handleTambahStok(record)} />
            </Tooltip>
        </Space>
    ), [handleEdit, handleTambahStok]);

    // --- MODIFIKASI BESAR: Definisi Kolom diubah total ---
    const columns = useMemo(() => [
        { 
            title: 'Kode Plate', 
            dataIndex: 'kode_plate', 
            key: 'kode_plate', 
            width: 150, 
            fixed: screens.md ? 'left' : false 
        },
        { 
            title: 'Merek Plate', 
            dataIndex: 'merek_plate', 
            key: 'merek_plate', 
            width: 150,
            filters: merekFilters, // <-- MODIFIKASI: Filter baru
            filteredValue: columnFilters.merek_plate || null,
            onFilter: (v, r) => r.merek_plate === v
        },
        { 
            title: 'Ukuran Plate', 
            dataIndex: 'ukuran_plate', 
            key: 'ukuran_plate', 
            width: 150 
        },
        { 
            title: 'Harga Plate', 
            dataIndex: 'harga_plate', 
            key: 'harga_plate', 
            align: 'right', 
            width: 150, 
            render: currencyFormatter 
        },
        { 
            title: 'Stok', 
            dataIndex: 'stok', 
            key: 'stok', 
            align: 'right', 
            width: 100, 
            render: numberFormatter 
        },
        { 
            title: 'Aksi', 
            key: 'aksi', 
            align: 'center', 
            width: 100, 
            render: renderAksi, 
            fixed: screens.md ? 'right' : false 
        },
    ], [
        merekFilters, // <-- MODIFIKASI: Dependensi baru
        columnFilters, 
        renderAksi, 
        screens.md,
    ]);
    // --- AKHIR MODIFIKASI KOLOM ---

    const tableScrollX = useMemo(() => columns.reduce((acc, col) => acc + (col.width || 150), 0), [columns]);

    const getRowClassName = useCallback((_, index) => index % 2 === 1 ? 'ant-table-row-odd' : '', []);

    return (
        <Content style={{ padding: screens.xs ? '12px' : '24px' }}>
            <Tabs defaultActiveKey="1" type="card">
                {/* --- MODIFIKASI: Judul Tab --- */}
                <TabPane tab={<Space><ReadOutlined /> Manajemen Plate</Space>} key="1">
                    <Spin spinning={isFiltering} tip="Memfilter data...">
                        <Card>
                            <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                                <Col lg={6} md={8} sm={24} xs={24}>
                                    {/* --- MODIFIKASI: Judul Halaman --- */}
                                    <Title level={5} style={{ margin: 0 }}>Manajemen Data Plate</Title>
                                </Col>
                                <Col lg={18} md={16} sm={24} xs={24}>
                                    <Space direction={screens.xs ? 'vertical' : 'horizontal'} style={{ width: '100%', justifyContent: 'flex-end' }}>
                                        <Input.Search
                                            // --- MODIFIKASI: Placeholder ---
                                            placeholder="Cari Kode, Merek, Ukuran..."
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            allowClear
                                            style={{ width: screens.xs ? '100%' : 250 }}
                                            enterButton
                                        />
                                        <Space wrap>
                                            {/* --- MODIFIKASI: Teks Tombol --- */}
                                            <Button onClick={handleGenerateAndShowPdf} icon={<PrinterOutlined />} loading={isGeneratingPdf}>
                                                Cetak Stok Plate
                                            </Button>
                                            <Button icon={<ContainerOutlined />} onClick={handleOpenBulkRestockModal} disabled={initialLoading || plateList.length === 0}>
                                                {screens.xs ? 'Restock' : 'Restock Massal'}
                                            </Button>
                                            <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} disabled={initialLoading}>
                                                {/* --- MODIFIKASI: Teks Tombol --- */}
                                                Tambah Plate
                                            </Button>
                                        </Space>
                                    </Space>
                                </Col>
                            </Row>

                            <BukuTableComponent
                                columns={columns}
                                dataSource={dataForTable}
                                loading={initialLoading || isFiltering}
                                isCalculating={initialLoading}
                                pagination={pagination}
                                summaryData={summaryData} // <-- MODIFIKASI: Summary baru
                                handleTableChange={handleTableChange}
                                tableScrollX={tableScrollX}
                                rowClassName={getRowClassName}
                            />
                        </Card>
                    </Spin>
                </TabPane>

                <TabPane tab={<Space><PullRequestOutlined /> Riwayat Stok</Space>} key="2">
                    {/* Komponen ini sudah diupdate di request sebelumnya untuk menangani plate */}
                    <StokHistoryTab />
                </TabPane>
            </Tabs>

            {/* --- MODIFIKASI: Props untuk Modal --- */}
            {isModalOpen && <BukuForm open={isModalOpen} onCancel={handleCloseModal} initialValues={editingPlate} />}
            {isStokModalOpen && <StokFormModal open={isStokModalOpen} onCancel={handleCloseStokModal} plate={stokPlate} />} 
            {isPreviewModalVisible && (
                <PdfPreviewModal
                    visible={isPreviewModalVisible}
                    onClose={handleClosePreviewModal}
                    pdfBlobUrl={pdfPreviewUrl} // <-- Pastikan PdfPreviewModal menerima 'pdfBlobUrl'
                    fileName={pdfFileName}
                />
            )}
            {isBulkRestockModalOpen && (
                <BulkRestockModal
                    open={isBulkRestockModalOpen}
                    onClose={handleCloseBulkRestockModal}
                    plateList={plateList} // <-- MODIFIKASI: ganti nama prop
                />
            )}
        </Content>
    );
};

export default BukuPage;