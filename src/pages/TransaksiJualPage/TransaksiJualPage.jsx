// ================================
// FILE: src/pages/transaksi-jual/TransaksiJualPage.jsx
// MODIFIKASI:
// 1. Mengganti @react-pdf-viewer dengan <iframe /> native browser.
// 2. Memastikan fitur Cetak (Print) bawaan browser bisa digunakan langsung.
// 3. Menambahkan kolom 'jumlahTerbayar'.
// 4. Menambahkan fitur Sortir dan Filter pada header kolom.
// ================================

import React, { useEffect, useState, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Spin, Empty, Typography, Input, Row, Col, Statistic, Tag, Button, Modal,
    App, DatePicker, Space, Tabs, Tooltip
} from 'antd';
import {
    PlusOutlined, DownloadOutlined, ShareAltOutlined, EditOutlined,
    PrinterOutlined, ReadOutlined, PullRequestOutlined, EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// Impor PDF Generator Library
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Hooks & Components
import useDebounce from '../../hooks/useDebounce'; 
import TransaksiJualForm from './components/TransaksiJualForm'; 
import TransaksiJualDetailModal from './components/TransaksiJualDetailModal'; 
import TransaksiJualTableComponent from './components/TransaksiJualTableComponent'; 
import { generateNotaPDF } from '../../utils/pdfGenerator'; 

// Hooks Data
import { useTransaksiJualData, useBukuData, usePelangganData } from '../../hooks/useTransaksiData'; 
import TagihanPelangganTab from './components/TagihanPelangganTab'; 

const { Content } = Layout;
const { Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

// --- Helpers ---
const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const normalizeStatus = (s) => (s === 'DP' ? 'Sebagian' : s || 'N/A');

// Style untuk Chip Filter
const chipStyle = {
    padding: '4px 12px',
    fontSize: '14px',
    border: '1px solid #d9d9d9',
    borderRadius: '16px',
    lineHeight: '1.5',
};

export default function TransaksiJualPage() {
    const { message } = App.useApp();

    // --- Data Global via Hooks ---
    const { data: allTransaksi, loading: loadingTransaksi } = useTransaksiJualData();
    const { data: plateList, loading: loadingPlates } = useBukuData(); 
    const { data: pelangganList, loading: loadingPelanggan } = usePelangganData(); 
    const loadingDependencies = loadingPlates || loadingPelanggan;

    // --- State TAB 1 ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [selectedStatus, setSelectedStatus] = useState([]);
    const [dateRange, setDateRange] = useState(null);
    const showTotalPagination = useCallback((total, range) => `${range[0]}-${range[1]} dari ${total} transaksi`, []);
    const [pagination, setPagination] = useState({
        current: 1, pageSize: 25, 
        showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'],
        showTotal: showTotalPagination
    });

    // --- State Modals ---
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [formMode, setFormMode] = useState('create');
    const [editingTx, setEditingTx] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTransaksi, setSelectedTransaksi] = useState(null);

    // --- State PDF Modal ---
    const [isTxPdfModalOpen, setIsTxPdfModalOpen] = useState(false);
    const [txPdfBlob, setTxPdfBlob] = useState(null);
    const [txPdfTitle, setTxPdfTitle] = useState('');
    const [isTxPdfGenerating, setIsTxPdfGenerating] = useState(false);
    const [txPdfFileName, setTxPdfFileName] = useState('laporan.pdf');
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

    // --- Defer State ---
    const deferredAllTransaksi = useDeferredValue(allTransaksi);
    const deferredDebouncedSearch = useDeferredValue(debouncedSearchText);
    const deferredSelectedStatus = useDeferredValue(selectedStatus);
    const deferredDateRange = useDeferredValue(dateRange);

    const isFilterActive = useMemo(() => {
        return !!deferredDebouncedSearch || deferredSelectedStatus.length > 0 || !!deferredDateRange;
    }, [deferredDebouncedSearch, deferredSelectedStatus, deferredDateRange]);

    // --- Filter Data Logic (Global Filter) ---
    const filteredTransaksi = useMemo(() => {
        let data = [...deferredAllTransaksi]; 

        if (deferredDateRange) {
            const [startDate, endDate] = deferredDateRange;
            if (startDate && endDate) {
                data = data.filter((tx) => {
                    const txDate = dayjs(tx.tanggal);
                    if (!tx.tanggal || !txDate.isValid()) return false;
                    const isAfterOrSameStart = txDate.isSame(startDate, 'day') || txDate.isAfter(startDate, 'day');
                    const isBeforeOrSameEnd = txDate.isSame(endDate, 'day') || txDate.isBefore(endDate, 'day');
                    return isAfterOrSameStart && isBeforeOrSameEnd;
                });
            }
        }

        if (deferredSelectedStatus.length > 0) {
            data = data.filter((tx) => deferredSelectedStatus.includes(normalizeStatus(tx.statusPembayaran)));
        }

        if (deferredDebouncedSearch) {
            const q = deferredDebouncedSearch.toLowerCase();
            data = data.filter((tx) =>
                (tx.nomorInvoice || '').toLowerCase().includes(q) ||
                (tx.namaPelanggan || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q)
            );
        }

        return data.sort((a, b) => (b.tanggal || 0) - (a.tanggal || 0));
    }, [deferredAllTransaksi, deferredSelectedStatus, deferredDebouncedSearch, deferredDateRange]);

    const isFiltering =
        allTransaksi !== deferredAllTransaksi ||
        debouncedSearchText !== deferredDebouncedSearch ||
        selectedStatus !== deferredSelectedStatus ||
        dateRange !== deferredDateRange;

    // --- Kalkulasi Rekap ---
    const recapData = useMemo(() => {
        const dataToRecap = filteredTransaksi;
        const totals = dataToRecap.reduce(
            (acc, tx) => ({
                tagihan: acc.tagihan + Number(tx.totalTagihan || 0),
                terbayar: acc.terbayar + Number(tx.jumlahTerbayar || 0)
            }),
            { tagihan: 0, terbayar: 0 }
        );
        return {
            totalTagihan: totals.tagihan,
            totalTerbayar: totals.terbayar,
            sisaTagihan: totals.tagihan - totals.terbayar,
            isFilterActive: isFilterActive
        };
    }, [filteredTransaksi, isFilterActive]);

    // --- Handlers UI ---
    const handleSearchChange = useCallback((e) => { setSearchText(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleDateChange = useCallback((dates) => { setDateRange(dates); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleStatusToggle = useCallback((status) => { setSelectedStatus(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const resetFilters = useCallback(() => { setSearchText(''); setSelectedStatus([]); setDateRange(null); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleTableChange = useCallback((paginationConfig, filters, sorter) => { 
        setPagination(paginationConfig); 
        // Logic tambahan jika ingin handle server-side filtering/sorting bisa disini
    }, []);

    // --- Handlers Modals ---
    const handleOpenCreate = useCallback(() => { setFormMode('create'); setEditingTx(null); setIsFormModalOpen(true); }, []);
    const handleOpenEdit = useCallback((tx) => { setFormMode('edit'); setEditingTx(tx); setIsFormModalOpen(true); }, []);
    const handleCloseFormModal = useCallback(() => { setIsFormModalOpen(false); setEditingTx(null); }, []);
    const handleFormSuccess = useCallback(() => { handleCloseFormModal(); }, [handleCloseFormModal]);
    const handleOpenDetailModal = useCallback((tx) => { setSelectedTransaksi(tx); setIsDetailModalOpen(true); }, []);
    const handleCloseDetailModal = useCallback(() => { setSelectedTransaksi(null); setIsDetailModalOpen(false); }, []);

    // --- Handlers PDF ---
    const handleCloseTxPdfModal = useCallback(() => { 
        setIsTxPdfModalOpen(false); 
        setIsTxPdfGenerating(false); 
        setTxPdfBlob(null); 
        setTxPdfTitle(''); 
        if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
        }
    }, [pdfPreviewUrl]);
    
    // 1. Generate NOTA
    const handleGenerateNota = useCallback(async (tx) => {
        const baseId = tx.nomorInvoice || tx.id;
        const fileName = baseId.replace(/^INV-/i, 'NT-'); 
        setTxPdfTitle(`Nota: ${baseId}`);
        setTxPdfFileName(fileName);
        setIsTxPdfGenerating(true);
        setIsTxPdfModalOpen(true);
        setTxPdfBlob(null);
        setPdfPreviewUrl(null);

        try {
            const dataUri = generateNotaPDF(tx);
            const blob = await fetch(dataUri).then(r => r.blob());
            setTxPdfBlob(blob);
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch (err) {
            console.error("Gagal generate nota PDF:", err);
            message.error('Gagal membuat PDF nota.');
            setIsTxPdfModalOpen(false);
        } finally {
            setIsTxPdfGenerating(false);
        }
    }, [message]);

    // 2. Download & Share Handler
    const handleDownloadTxPdf = useCallback(async () => {
        if (!txPdfBlob) return;
        message.loading({ content: 'Mengunduh...', key: 'pdfdl_tx', duration: 0 });
        try {
            const url = URL.createObjectURL(txPdfBlob);
            const link = document.createElement('a');
            link.href = url;
            const fn = `${txPdfFileName.replace(/[\/:]/g, '_') || 'download'}.pdf`;
            link.setAttribute('download', fn);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success({ content: 'Unduhan dimulai!', key: 'pdfdl_tx', duration: 2 });
        } catch (err) {
            message.error({ content: `Gagal mengunduh: ${err.message}`, key: 'pdfdl_tx', duration: 3 });
        }
    }, [txPdfBlob, txPdfFileName, message]);

    const handleShareTxPdf = useCallback(async () => {
        if (!navigator.share) { message.error('Fitur share tidak didukung di browser ini.'); return; }
        if (!txPdfBlob) return;
        const fn = `${txPdfFileName.replace(/[\/:]/g, '_') || 'file'}.pdf`;
        const file = new File([txPdfBlob], fn, { type: 'application/pdf' });
        const shareData = { title: txPdfTitle, text: `File PDF: ${txPdfTitle}`, files: [file] };
        if (navigator.canShare && navigator.canShare(shareData)) {
            try { await navigator.share(shareData); message.success('Berhasil dibagikan!'); } 
            catch (err) { if (err.name !== 'AbortError') message.error(`Gagal berbagi: ${err.message}`); }
        } else { message.warn('Berbagi file PDF tidak didukung.'); }
    }, [txPdfBlob, txPdfTitle, txPdfFileName, message]);

    // 3. Generate Laporan Bulanan (Filter)
    const handleGenerateReportPdf = useCallback(async () => {
        if (filteredTransaksi.length === 0) {
            message.warning('Tidak ada data transaksi untuk dicetak pada filter ini.');
            return;
        }
        const title = 'Laporan Transaksi Penjualan';
        setTxPdfTitle(title);
        setIsTxPdfGenerating(true);
        setIsTxPdfModalOpen(true);
        setTxPdfBlob(null);
        setPdfPreviewUrl(null);
        
        const formattedDate = dayjs().locale('id').format('MMMM_DD');
        setTxPdfFileName(`Laporan_Penjualan_${formattedDate}`);

        setTimeout(async () => {
            try {
                const doc = new jsPDF();
                let startY = 36; doc.setFontSize(18); doc.text(title, 14, 22); doc.setFontSize(10);
                const filterInfo = []; if (deferredDateRange) filterInfo.push(`Tgl: ${deferredDateRange[0].format('DD/MM/YY')} - ${deferredDateRange[1].format('DD/MM/YY')}`); if (deferredSelectedStatus.length > 0) filterInfo.push(`Status: ${deferredSelectedStatus.join(', ')}`); if (deferredDebouncedSearch) filterInfo.push(`Cari: "${deferredDebouncedSearch}"`);
                if (filterInfo.length > 0) doc.text(`Filter Aktif: ${filterInfo.join(' | ')}`, 14, 28); else { doc.text('Filter Aktif: Menampilkan Semua', 14, 28); }
                autoTable(doc, { startY: startY, body: [['Total Tagihan', formatCurrency(recapData.totalTagihan)], ['Total Terbayar', formatCurrency(recapData.totalTerbayar)], ['Total Sisa Tagihan', formatCurrency(recapData.sisaTagihan)]], theme: 'grid', styles: { fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', halign: 'right' }, 1: { halign: 'right' } }, didDrawCell: (data) => { if (data.section === 'body') { if (data.row.index === 1) data.cell.styles.textColor = [40, 167, 69]; if (data.row.index === 2) data.cell.styles.textColor = [220, 53, 69]; } } });
                const tableHead = ['Tanggal', 'ID Transaksi', 'Pelanggan', 'Total Tagihan', 'Terbayar', 'Sisa Tagihan', 'Status']; 
                const tableBody = filteredTransaksi.map(tx => { 
                    const sisa = (tx.totalTagihan || 0) - (tx.jumlahTerbayar || 0); 
                    return [
                        formatDate(tx.tanggal), 
                        tx.nomorInvoice || tx.id, 
                        tx.namaPelanggan || '-', 
                        formatCurrency(tx.totalTagihan), 
                        formatCurrency(tx.jumlahTerbayar), // Add Terbayar to PDF
                        formatCurrency(sisa), 
                        normalizeStatus(tx.statusPembayaran)
                    ]; 
                });
                autoTable(doc, { head: [tableHead], body: tableBody, startY: doc.lastAutoTable.finalY + 10, theme: 'striped', headStyles: { fillColor: [41, 128, 185] }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }, foot: [['', '', 'TOTAL', formatCurrency(recapData.totalTagihan), formatCurrency(recapData.totalTerbayar), formatCurrency(recapData.sisaTagihan), '']], footStyles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230], textColor: 0 } });
                
                const blob = doc.output('blob');
                setTxPdfBlob(blob);
                setPdfPreviewUrl(URL.createObjectURL(blob));

            } catch (err) {
                console.error("Error generate report:", err);
                message.error('Gagal membuat PDF Laporan.');
                setIsTxPdfModalOpen(false);
            } finally { setIsTxPdfGenerating(false); }
        }, 50);
    }, [filteredTransaksi, recapData, deferredDateRange, deferredSelectedStatus, deferredDebouncedSearch, message]);


    // --- Column Filter & Sort Helpers ---
    // Mengambil value unik dari data untuk opsi filter
    const uniqueFilters = useMemo(() => {
        const getFilters = (key) => {
            const values = filteredTransaksi.map(item => item[key]).filter(Boolean);
            const unique = [...new Set(values)];
            return unique.map(val => ({ text: val, value: val })).sort((a, b) => a.text.localeCompare(b.text));
        };
        const getStatusFilters = () => {
            const values = filteredTransaksi.map(item => normalizeStatus(item.statusPembayaran)).filter(Boolean);
            const unique = [...new Set(values)];
            return unique.map(val => ({ text: val, value: val }));
        };

        return {
            pelanggan: getFilters('namaPelanggan'),
            id: getFilters('nomorInvoice'), // Gunakan nomorInvoice jika ada, fallback ke ID handled di column
            keterangan: getFilters('keterangan'),
            status: getStatusFilters()
        };
    }, [filteredTransaksi]);


    // --- Column Definition ---
    const renderAksi = useCallback((_, record) => {
        return (
            <Space size="small">
                <Tooltip title="Lihat Detail">
                    <Button icon={<EyeOutlined />} size="small" onClick={() => handleOpenDetailModal(record)} />
                </Tooltip>
                <Tooltip title="Edit Transaksi">
                    <Button icon={<EditOutlined />} size="small" style={{ color: '#faad14', borderColor: '#faad14' }} onClick={() => handleOpenEdit(record)} />
                </Tooltip>
                <Tooltip title="Cetak Nota">
                    <Button icon={<PrinterOutlined />} size="small" onClick={() => handleGenerateNota(record)} />
                </Tooltip>
            </Space>
        );
    }, [handleOpenDetailModal, handleOpenEdit, handleGenerateNota]);

    const columns = useMemo(() => [
        { 
            title: 'No.', 
            key: 'index', 
            width: 60, 
            render: (_t, _r, idx) => ((pagination.current - 1) * pagination.pageSize) + idx + 1 
        },
        { 
            title: 'Tanggal', 
            dataIndex: 'tanggal', 
            key: 'tanggal', 
            width: 120, 
            render: formatDate, 
            sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0) 
        },
        { 
            title: 'ID Transaksi', 
            dataIndex: 'nomorInvoice', // Prioritaskan Invoice
            key: 'id', 
            width: 180, 
            render: (val, record) => <small>{val || record.id}</small>,
            sorter: (a, b) => (a.nomorInvoice || a.id || '').localeCompare(b.nomorInvoice || b.id || ''),
            // filters: uniqueFilters.id,
            filterSearch: true,
            onFilter: (value, record) => (record.nomorInvoice || record.id || '').includes(value)
        },
        { 
            title: 'Pelanggan', 
            dataIndex: 'namaPelanggan', 
            key: 'namaPelanggan', 
            width: 220, 
            sorter: (a, b) => (a.namaPelanggan || '').localeCompare(b.namaPelanggan || ''), 
            render: (val, record) => (<span>{val} {record.pelangganIsSpesial ? <Tag color="gold">Spesial</Tag> : null}</span>),
            // filters: uniqueFilters.pelanggan,
            filterSearch: true,
            onFilter: (value, record) => (record.namaPelanggan || '').includes(value)
        },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            key: 'keterangan', 
            ellipsis: true, 
            render: (v) => v || '-',
            sorter: (a, b) => (a.keterangan || '').localeCompare(b.keterangan || ''),
            // filters: uniqueFilters.keterangan,
            filterSearch: true,
            onFilter: (value, record) => (record.keterangan || '').includes(value)
        },
        { 
            title: 'Total Tagihan', 
            dataIndex: 'totalTagihan', 
            key: 'totalTagihan', 
            align: 'right', 
            width: 150, 
            render: formatCurrency, 
            sorter: (a, b) => (a.totalTagihan || 0) - (b.totalTagihan || 0) 
        },
        // --- ADDED: Kolom Jumlah Terbayar ---
        { 
            title: 'Terbayar', 
            dataIndex: 'jumlahTerbayar', 
            key: 'jumlahTerbayar', 
            align: 'right', 
            width: 150, 
            render: (val) => <span style={{ color: '#3f8600' }}>{formatCurrency(val)}</span>, 
            sorter: (a, b) => (a.jumlahTerbayar || 0) - (b.jumlahTerbayar || 0) 
        },
        { 
            title: 'Sisa Tagihan', 
            key: 'sisaTagihan', 
            align: 'right', 
            width: 150, 
            render: (_, r) => { 
                const sisa = (r.totalTagihan || 0) - (r.jumlahTerbayar || 0); 
                return <span style={{ color: sisa > 0 ? '#cf1322' : '#3f8600', fontWeight: 600 }}>{formatCurrency(sisa)}</span>; 
            }, 
            sorter: (a, b) => ((a.totalTagihan || 0) - (a.jumlahTerbayar || 0)) - ((b.totalTagihan || 0) - (b.jumlahTerbayar || 0)) 
        },
        { 
            title: 'Status', 
            dataIndex: 'statusPembayaran', 
            key: 'statusPembayaran', 
            width: 130, 
            render: (statusRaw) => { 
                const status = normalizeStatus(statusRaw); 
                let color = 'default'; 
                if (status === 'Lunas') color = 'green'; 
                else if (status === 'Belum Bayar') color = 'red'; 
                else if (status === 'Sebagian') color = 'orange'; 
                return <Tag color={color}>{status}</Tag>; 
            },
            sorter: (a, b) => (normalizeStatus(a.statusPembayaran)).localeCompare(normalizeStatus(b.statusPembayaran)),
            filters: uniqueFilters.status,
            onFilter: (value, record) => normalizeStatus(record.statusPembayaran) === value
        },
        { title: 'Aksi', key: 'aksi', align: 'center', width: 150, fixed: 'right', render: renderAksi },
    ], [pagination, renderAksi, uniqueFilters]);

    const tableScrollX = useMemo(() => columns.reduce((acc, col) => acc + (col.width || 150), 0), [columns]);

    // --- Render JSX ---
    return (
        <Layout>
             <Content style={{ padding: '24px', backgroundColor: '#f0f2f5' }}>
                 <Tabs defaultActiveKey="1" type="card">
                     {/* TAB 1 */}
                     <TabPane tab={<Space><ReadOutlined /> Daftar Transaksi</Space>} key="1">
                         <Card style={{ marginBottom: 24 }}>
                            <Title level={4} style={{ margin: 0, marginBottom: 24 }}>Ringkasan Transaksi</Title>
                             <Row gutter={[16, 16]}>
                                 <Col xs={24} lg={8}><Card variant="borderless" style={{ backgroundColor: '#f0f2f5' }}><Statistic title={`Total Tagihan (${recapData.isFilterActive ? 'Filter' : 'All'})`} value={recapData.totalTagihan} formatter={formatCurrency} /></Card></Col>
                                 <Col xs={24} lg={8}><Card variant="borderless" style={{ backgroundColor: '#f0f2f5' }}><Statistic title={`Total Terbayar (${recapData.isFilterActive ? 'Filter' : 'All'})`} value={recapData.totalTerbayar} formatter={formatCurrency} valueStyle={{ color: '#3f8600' }} /></Card></Col>
                                <Col xs={24} lg={8}><Card variant="borderless" style={{ backgroundColor: '#f0f2f5' }}><Statistic title={`Total Sisa (${recapData.isFilterActive ? 'Filter' : 'All'})`} value={recapData.sisaTagihan} formatter={formatCurrency} valueStyle={{ color: recapData.sisaTagihan > 0 ? '#cf1322' : '#3f8600' }} /></Card></Col>
                             </Row>
                         </Card>

                         <Card>
                             <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                 <Col xs={24} sm={12}><Title level={5} style={{ margin: 0 }}>Daftar Transaksi</Title></Col>
                                 <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
                                     <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
                                         <Button icon={<PrinterOutlined />} onClick={handleGenerateReportPdf} disabled={isFiltering || filteredTransaksi.length === 0 || isTxPdfGenerating} loading={isTxPdfGenerating}> Cetak PDF (Filter) </Button>
                                         <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} disabled={loadingDependencies}> Tambah Transaksi </Button>
                                     </Space>
                                 </Col>
                             </Row>
                             <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                 <Col xs={24} sm={12} md={12}><Search placeholder="Cari No. Invoice, Pelanggan..." value={searchText} onChange={handleSearchChange} allowClear style={{ width: '100%' }} /></Col>
                                 <Col xs={24} sm={12} md={12}><RangePicker value={dateRange} onChange={handleDateChange} style={{ width: '100%' }} placeholder={['Tgl Mulai', 'Tgl Selesai']} /></Col>
                             </Row>
                             <Row justify="start" style={{ marginBottom: 24 }}>
                                 <Col><Space wrap>
                                     {['Belum Bayar', 'Sebagian', 'Lunas'].map(status => (
                                         <Tag.CheckableTag key={status} style={chipStyle} checked={selectedStatus.includes(status)} onChange={() => handleStatusToggle(status)}>{status === 'Sebagian' ? 'DP (Sebagian)' : status}</Tag.CheckableTag>
                                     ))}
                                     {isFilterActive && ( <Button type="link" size="small" onClick={resetFilters}> Reset Filter </Button> )}
                                 </Space></Col>
                             </Row>
                             <Spin spinning={isFiltering} tip="Memfilter data...">
                                 <TransaksiJualTableComponent columns={columns} dataSource={filteredTransaksi} loading={loadingTransaksi || loadingDependencies} isFiltering={false} pagination={pagination} handleTableChange={handleTableChange} tableScrollX={tableScrollX} rowClassName={(r, i) => (i % 2 === 0 ? 'table-row-even' : 'table-row-odd')} />
                             </Spin>
                         </Card>
                     </TabPane>
                     {/* TAB 2 */}
                     <TabPane tab={<Space><PullRequestOutlined /> Tagihan per Pelanggan</Space>} key="2">
                         <TagihanPelangganTab allTransaksi={allTransaksi} loadingTransaksi={loadingTransaksi} />
                     </TabPane>
                 </Tabs>

                 {/* MODALS */}
                 {isFormModalOpen && (<TransaksiJualForm key={editingTx?.id || 'create'} open={isFormModalOpen} onCancel={handleCloseFormModal} mode={formMode} initialTx={editingTx} plateList={plateList} pelangganList={pelangganList} onSuccess={handleFormSuccess} loadingDependencies={loadingDependencies} />)}
                 <TransaksiJualDetailModal open={isDetailModalOpen} onCancel={handleCloseDetailModal} transaksi={selectedTransaksi} />

                 {/* Modal PDF (Iframe Preview) */}
                 <Modal
                     title={txPdfTitle}
                     open={isTxPdfModalOpen}
                     onCancel={handleCloseTxPdfModal}
                     width="95vw" style={{ top: 20 }}
                     destroyOnClose
                     footer={[
                         <Button key="close" onClick={handleCloseTxPdfModal}>Tutup</Button>,
                         navigator.share && (<Button key="share" icon={<ShareAltOutlined />} onClick={handleShareTxPdf} disabled={isTxPdfGenerating || !txPdfBlob}>Bagikan</Button>),
                         <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadTxPdf} disabled={isTxPdfGenerating || !txPdfBlob}>Unduh</Button>
                     ]}
                     bodyStyle={{ padding: 0, height: 'calc(100vh - 150px)', position: 'relative' }}
                 >
                     {isTxPdfGenerating ? (
                         <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', zIndex: 10 }}>
                             <Spin size="large" tip="Membuat file PDF..." />
                         </div>
                     ) : pdfPreviewUrl ? (
                         <iframe 
                             src={pdfPreviewUrl} 
                             width="100%" 
                             height="100%" 
                             style={{ border: 'none' }}
                             title="PDF Preview"
                         />
                     ) : (
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}><Empty description="Gagal memuat PDF." /></div>
                     )}
                 </Modal>
             </Content>
         </Layout>
    );
}