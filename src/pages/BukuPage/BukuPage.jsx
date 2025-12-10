import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Modal, Input, Space, Typography, Row, Col, Tabs, 
    message, Tooltip, Empty, Grid, DatePicker, Spin, Divider, App 
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
import useBukuData from '../../hooks/useBukuData'; 
import useDebounce from '../../hooks/useDebounce';
import {
    currencyFormatter, numberFormatter, generateFilters
} from '../../utils/formatters';
import { generateBukuPdfBlob } from '../../utils/pdfBuku'; 
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title } = Typography;
const { TabPane } = Tabs;

const BukuPage = () => {
    // --- State ---
    const { data: plateList, loading: initialLoading } = useBukuData(); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStokModalOpen, setIsStokModalOpen] = useState(false);
    const [isBulkRestockModalOpen, setIsBulkRestockModalOpen] = useState(false);
    
    const [editingPlate, setEditingPlate] = useState(null);
    const [stokPlate, setStokPlate] = useState(null);
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const screens = Grid.useBreakpoint();
    const [columnFilters, setColumnFilters] = useState({});

    const showTotalPagination = useCallback((total, range) => {
        const totalJenis = plateList?.length || 0; 
        return `${range[0]}-${range[1]} dari ${total} (Total ${numberFormatter(totalJenis)} Jenis)`;
    }, [plateList]); 

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

    // --- Logic Pencarian ---
    const searchedBuku = useMemo(() => {
        let processedData = [...plateList]; 
        processedData.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (!deferredDebouncedSearchText) return processedData;

        const lowerSearch = deferredDebouncedSearchText.toLowerCase();
        return processedData.filter(plate => 
            // Meskipun kolom dihapus, user biasanya masih ingin bisa mencari by kode
            (plate.kode_plate || '').toLowerCase().includes(lowerSearch) ||
            (plate.merek_plate || '').toLowerCase().includes(lowerSearch) ||
            (plate.ukuran_plate || '').toLowerCase().includes(lowerSearch)
        );
    }, [plateList, deferredDebouncedSearchText]); 

    const merekFilters = useMemo(() => generateFilters(plateList, 'merek_plate'), [plateList]);

    const dataForTable = useMemo(() => {
        let processedData = [...searchedBuku];
        const activeFilterKeys = Object.keys(columnFilters).filter(
            key => columnFilters[key] && columnFilters[key].length > 0
        );
        if (activeFilterKeys.length === 0) return processedData;

        for (const key of activeFilterKeys) {
            const filterValues = columnFilters[key];
            if (key === 'merek_plate') { 
                processedData = processedData.filter(item => {
                    const itemValue = item[key];
                    return filterValues.includes(itemValue);
                });
            }
        }
        return processedData;
    }, [searchedBuku, columnFilters]);


    const summaryData = useMemo(() => {
        if (initialLoading || !dataForTable || dataForTable.length === 0) {
            return { totalStok: 0, totalAsset: 0, totalJudul: 0 };
        }
        const { totalStok, totalAsset } = dataForTable.reduce((acc, item) => {
            const stok = Number(item.stok) || 0;
            const harga = Number(item.harga_plate) || 0; 

            acc.totalStok += stok;
            acc.totalAsset += stok * harga; 
            return acc;
        }, { totalStok: 0, totalAsset: 0 }); 

        return { totalStok, totalAsset, totalJudul: dataForTable.length };
    }, [dataForTable, initialLoading]);

    useEffect(() => {
        setPagination(prev => ({ ...prev, current: 1 }));
        setColumnFilters({});
    }, [debouncedSearchText]);

    const handleTableChange = useCallback((paginationConfig, filters, sorter) => {
        setPagination(paginationConfig);
        setColumnFilters(filters);
        // Sorter ditangani otomatis oleh Antd Table local data, tapi perlu parameter ini agar tidak error
    }, []);

    const handleTambah = useCallback(() => { setEditingPlate(null); setIsModalOpen(true); }, []);
    const handleEdit = useCallback((record) => { setEditingPlate(record); setIsModalOpen(true); }, []);
    const handleTambahStok = useCallback((record) => { setStokPlate(record); setIsStokModalOpen(true); }, []);
    const handleCloseModal = useCallback(() => { setIsModalOpen(false); setEditingPlate(null); }, []);
    const handleCloseStokModal = useCallback(() => { setIsStokModalOpen(false); setStokPlate(null); }, []);
    const handleOpenBulkRestockModal = useCallback(() => {
        if (!plateList || plateList.length === 0) { message.warn("Data plate belum dimuat."); return; } 
        setIsBulkRestockModalOpen(true);
    }, [plateList]); 
    const handleCloseBulkRestockModal = useCallback(() => { setIsBulkRestockModalOpen(false); }, []);

    const handleGenerateAndShowPdf = useCallback(async () => {
        const dataToExport = dataForTable;
        if (!dataToExport?.length) { message.warn('Tidak ada data untuk PDF.'); return; }
        setIsGeneratingPdf(true);
        message.loading({ content: 'Membuat PDF...', key: 'pdfgen', duration: 0 });
        setTimeout(async () => {
            try {
                if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
                const pdfBlob = generateBukuPdfBlob(dataToExport); 
                if (!pdfBlob || !(pdfBlob instanceof Blob) || pdfBlob.size === 0) { throw new Error("Gagal membuat PDF."); }
                const url = URL.createObjectURL(pdfBlob);
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

    // --- MODIFIKASI: Definisi Kolom ---
    const columns = useMemo(() => [
        { 
            title: 'Merek Plate', 
            dataIndex: 'merek_plate', 
            key: 'merek_plate', 
            width: 150,
            fixed: screens.md ? 'left' : false, 
            filters: merekFilters, 
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
            title: 'Harga Beli', // MODIFIKASI: Ubah judul
            dataIndex: 'harga_plate', 
            key: 'harga_plate', 
            align: 'right', 
            width: 150, 
            render: currencyFormatter,
            // MODIFIKASI: Tambah sorter harga
            sorter: (a, b) => (Number(a.harga_plate) || 0) - (Number(b.harga_plate) || 0),
        },
        { 
            title: 'Stok', 
            dataIndex: 'stok', 
            key: 'stok', 
            align: 'right', 
            width: 100, 
            render: numberFormatter,
            // MODIFIKASI: Tambah sorter stok
            sorter: (a, b) => (Number(a.stok) || 0) - (Number(b.stok) || 0),
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
        merekFilters, 
        columnFilters, 
        renderAksi, 
        screens.md,
    ]);

    const tableScrollX = useMemo(() => columns.reduce((acc, col) => acc + (col.width || 150), 0), [columns]);

    const getRowClassName = useCallback((_, index) => index % 2 === 1 ? 'ant-table-row-odd' : '', []);

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
                                    <Space direction={screens.xs ? 'vertical' : 'horizontal'} style={{ width: '100%', justifyContent: 'flex-end' }}>
                                        <Input.Search
                                            placeholder="Cari Kode, Merek, Ukuran..."
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            allowClear
                                            style={{ width: screens.xs ? '100%' : 250 }}
                                            enterButton
                                        />
                                        <Space wrap>
                                            <Button onClick={handleGenerateAndShowPdf} icon={<PrinterOutlined />} loading={isGeneratingPdf}>
                                                Cetak Stok Plate
                                            </Button>
                                            <Button icon={<ContainerOutlined />} onClick={handleOpenBulkRestockModal} disabled={initialLoading || plateList.length === 0}>
                                                {screens.xs ? 'Restock' : 'Penyesuaian Stok'}
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
                                dataSource={dataForTable}
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

            {isModalOpen && <BukuForm open={isModalOpen} onCancel={handleCloseModal} initialValues={editingPlate} />}
            {isStokModalOpen && <StokFormModal open={isStokModalOpen} onCancel={handleCloseStokModal} plate={stokPlate} />} 
            {isPreviewModalVisible && (
                <PdfPreviewModal
                    visible={isPreviewModalVisible}
                    onClose={handleClosePreviewModal}
                    pdfBlobUrl={pdfPreviewUrl} 
                    fileName={pdfFileName}
                />
            )}
            {isBulkRestockModalOpen && (
                <BulkRestockModal
                    open={isBulkRestockModalOpen}
                    onClose={handleCloseBulkRestockModal}
                    plateList={plateList} 
                />
            )}
        </Content>
    );
};

export default BukuPage;