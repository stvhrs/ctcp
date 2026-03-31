import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    Card, Table, Input, Row, Col, Typography, DatePicker, Statistic, Button, Space, 
    Spin, Popconfirm, message, Modal, Form, InputNumber, Alert, Tabs, Tag, Divider
} from 'antd';
import { 
    EditOutlined, DeleteOutlined, HistoryOutlined, FileTextOutlined, 
    PrinterOutlined, DownloadOutlined, SearchOutlined, PlusOutlined 
} from '@ant-design/icons';
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';
import useSyncStokHistory from '../../../hooks/useSyncStokHistory.js';
import useDebounce from '../../../hooks/useDebounce';
import dayjs from 'dayjs';

// --- FIREBASE IMPORTS ---
import { ref, runTransaction, remove, update } from 'firebase/database';
import { db } from '../../../api/firebase';

import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;
const { RangePicker, MonthPicker } = DatePicker;

const StokHistoryTab = () => {
    const { data: allHistory, loading: historyLoading } = useSyncStokHistory();

    // --- STATE ---
    const [activeTab, setActiveTab] = useState('1');
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [actionLoading, setActionLoading] = useState(false);

    // TAB 1 (Riwayat)
    const [dateRange, setDateRange] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editForm] = Form.useForm();

    // TAB 2 (Laporan Bulanan)
    const [selectedMonth, setSelectedMonth] = useState(dayjs());

    // ==========================================
    // LOGIKA TAB 1: RIWAYAT TRANSAKSI (TIDAK DIUBAH)
    // ==========================================

    const handleDelete = async (record) => {
        if (!record.plateId || !record.id) return;
        setActionLoading(true);
        try {
            const plateRef = ref(db, `plate/${record.plateId}`);
            await runTransaction(plateRef, (currentData) => {
                if (!currentData) return;
                const stokSaatIni = Number(currentData.stok) || 0;
                const perubahanHistory = Number(record.perubahan) || 0;
                return { ...currentData, stok: stokSaatIni - perubahanHistory };
            });
            await remove(ref(db, `historiStok/${record.id}`));
            message.success("Riwayat dihapus dan stok dikembalikan.");
        } catch (error) {
            message.error("Gagal menghapus: " + error.message);
        } finally { setActionLoading(false); }
    };

    const handleEditSubmit = async () => {
        try {
            const values = await editForm.validateFields();
            setActionLoading(true);
            const oldQty = Number(editingItem.perubahan);
            const newQty = Number(values.perubahan);
            const diff = newQty - oldQty;

            if (diff !== 0) {
                const plateRef = ref(db, `plate/${editingItem.plateId}`);
                await runTransaction(plateRef, (currentData) => {
                    if (!currentData) return;
                    return { ...currentData, stok: (Number(currentData.stok) || 0) + diff };
                });
            }

            const updates = {
                tanggal: values.tanggal.format('YYYY-MM-DD'),
                perubahan: newQty,
                keterangan: values.keterangan,
                stokSesudah: (Number(editingItem.stokSebelum) || 0) + newQty 
            };

            await update(ref(db, `historiStok/${editingItem.id}`), updates);
            message.success("Riwayat diperbarui.");
            setIsEditModalOpen(false);
        } catch (error) {
            message.error("Gagal update: " + error.message);
        } finally { setActionLoading(false); }
    };

    const filteredHistoryDetail = useMemo(() => {
        let data = [...allHistory];
        if (dateRange?.[0] && dateRange?.[1]) {
            const start = dateRange[0].startOf('day');
            const end = dateRange[1].endOf('day');
            data = data.filter(item => {
                const checkDate = item.tanggal ? dayjs(item.tanggal) : dayjs(item.timestamp);
                return checkDate.isSameOrAfter(start) && checkDate.isSameOrBefore(end);
            });
        }
        if (debouncedSearchText) {
            const low = debouncedSearchText.toLowerCase();
            data = data.filter(i => 
                (i.merek_plate || '').toLowerCase().includes(low) || 
                (i.ukuran_plate || '').toLowerCase().includes(low)
            );
        }
        return data;
    }, [allHistory, debouncedSearchText, dateRange]);

    // ==========================================
    // LOGIKA TAB 2: LAPORAN BULANAN (DEFAULT SORT STOK AKHIR)
    // ==========================================

    const monthlyReportData = useMemo(() => {
        if (!selectedMonth) return [];
        const startOfMonth = selectedMonth.startOf('month');
        const endOfMonth = selectedMonth.endOf('month');
        const reportMap = {};

        const sortedHistory = [...allHistory].sort((a, b) => 
            (dayjs(a.tanggal || a.timestamp).unix()) - (dayjs(b.tanggal || b.timestamp).unix())
        );

        sortedHistory.forEach(item => {
            const itemDate = item.tanggal ? dayjs(item.tanggal) : dayjs(item.timestamp);
            const pid = item.plateId;
            if (!reportMap[pid]) {
                reportMap[pid] = { key: pid, merek: item.merek_plate, ukuran: item.ukuran_plate, stokAwal: 0, masuk: 0, keluar: 0, stokAkhir: 0 };
            }
            const perubahan = Number(item.perubahan) || 0;
            if (itemDate.isBefore(startOfMonth)) {
                reportMap[pid].stokAwal = item.stokSesudah;
                reportMap[pid].stokAkhir = item.stokSesudah;
            } else if (itemDate.isSameOrAfter(startOfMonth) && itemDate.isSameOrBefore(endOfMonth)) {
                if (reportMap[pid].stokAwal === 0 && !reportMap[pid].initialized) {
                    reportMap[pid].stokAwal = item.stokSebelum;
                    reportMap[pid].initialized = true;
                }
                if (perubahan > 0) reportMap[pid].masuk += perubahan;
                else reportMap[pid].keluar += Math.abs(perubahan);
                reportMap[pid].stokAkhir = item.stokSesudah;
            }
        });

        let finalArray = Object.values(reportMap);

        // --- FILTER SEARCH ---
        if (debouncedSearchText) {
            const low = debouncedSearchText.toLowerCase();
            finalArray = finalArray.filter(i => 
                (i.merek || '').toLowerCase().includes(low) || 
                (i.ukuran || '').toLowerCase().includes(low)
            );
        }

        // --- DEFAULT SORT: STOK AKHIR TERBANYAK (DARI USER REQUEST) ---
        return finalArray.sort((a, b) => b.stokAkhir - a.stokAkhir);
    }, [allHistory, selectedMonth, debouncedSearchText]);

    // ==========================================
    // LOGIKA PRINT: EMBED IFRAME (DIRECT PRINT)
    // ==========================================

    const handlePrintIframe = () => {
        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'fixed';
        printWindow.style.right = '0';
        printWindow.style.bottom = '0';
        printWindow.style.width = '0';
        printWindow.style.height = '0';
        printWindow.style.border = '0';
        document.body.appendChild(printWindow);

        const content = `
            <html>
                <head>
                    <title>Laporan Stok - CV Gangsar Mulia Utama</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; color: #333; }
                        .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
                        .header h1 { margin: 0; font-size: 22px; color: #000; }
                        .header p { margin: 2px 0; font-size: 12px; }
                        .title { text-align: center; margin-bottom: 20px; }
                        .title h2 { text-decoration: underline; font-size: 18px; margin-bottom: 5px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #000; padding: 8px; font-size: 12px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .text-right { text-align: right; }
                        .footer { margin-top: 30px; text-align: right; font-size: 12px; }
                        @page { size: auto; margin: 10mm; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>CV. GANGSAR MULIA UTAMA</h1>
                        <p>Jl. Kalicari Dalam I No.4, Kalicari, Kec. Pedurungan, Kota Semarang, Jawa Tengah 50198</p>
                        <p>Telp: 0882-0069-05391</p>
                    </div>
                    <div class="title">
                        <h2>LAPORAN POSISI STOK PLATE</h2>
                        <p>Periode: ${selectedMonth.format('MMMM YYYY')}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Merek</th>
                                <th>Ukuran</th>
                                <th class="text-right">Stok Awal</th>
                                <th class="text-right">Masuk</th>
                                <th class="text-right">Keluar</th>
                                <th class="text-right">Stok Akhir</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthlyReportData.map(item => `
                                <tr>
                                    <td>${item.merek}</td>
                                    <td>${item.ukuran}</td>
                                    <td class="text-right">${item.stokAwal}</td>
                                    <td class="text-right">+${item.masuk}</td>
                                    <td class="text-right">-${item.keluar}</td>
                                    <td class="text-right"><strong>${item.stokAkhir}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="footer">
                        <p>Semarang, ${dayjs().format('DD MMMM YYYY')}</p>
                        <br><br><br>
                        <p>( .................................. )</p>
                    </div>
                </body>
            </html>
        `;

        printWindow.contentDoc = printWindow.contentDocument || printWindow.contentWindow.document;
        printWindow.contentDoc.write(content);
        printWindow.contentDoc.close();

        printWindow.contentWindow.focus();
        setTimeout(() => {
            printWindow.contentWindow.print();
            document.body.removeChild(printWindow);
        }, 500);
    };

    // ==========================================
    // UI RENDER
    // ==========================================

    const reportColumns = [
        { title: 'Merek', dataIndex: 'merek', key: 'merek' },
        { title: 'Ukuran', dataIndex: 'ukuran', key: 'ukuran' },
        { title: 'Stok Awal', dataIndex: 'stokAwal', align: 'right' },
        { title: 'Masuk (+)', dataIndex: 'masuk', align: 'right', render: val => <Text type="success">+{val}</Text> },
        { title: 'Keluar (-)', dataIndex: 'keluar', align: 'right', render: val => <Text type="danger">-{val}</Text> },
        { title: 'Stok Akhir', dataIndex: 'stokAkhir', align: 'right', render: val => <Text strong style={{ color: '#1890ff' }}>{val}</Text> },
    ];

    const historyColumns = [
        { title: 'Tanggal', dataIndex: 'tanggal', render: (val, record) => val ? val : timestampFormatter(record.timestamp), width: 110 },
        { title: 'Merek', dataIndex: 'merek_plate', render: t => <Text strong>{t}</Text> },
        { title: 'Ukuran', dataIndex: 'ukuran_plate' },
        { 
            title: 'Perubahan', dataIndex: 'perubahan', align: 'right',
            render: val => <Tag color={val > 0 ? 'green' : 'red'}>{val > 0 ? `+${val}` : val}</Tag>
        },
        { title: 'Stok Akhir', dataIndex: 'stokSesudah', align: 'right' },
        { title: 'Keterangan', dataIndex: 'keterangan', ellipsis: true },
        {
            title: 'Aksi', fixed: 'right', width: 80,
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => {
                        setEditingItem(record);
                        editForm.setFieldsValue({
                            tanggal: record.tanggal ? dayjs(record.tanggal) : dayjs(record.timestamp),
                            perubahan: record.perubahan,
                            keterangan: record.keterangan
                        });
                        setIsEditModalOpen(true);
                    }} />
                    <Popconfirm title="Hapus?" onConfirm={() => handleDelete(record)}>
                        <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <Spin spinning={historyLoading}>
            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab}
                items={[
                    {
                        key: '1',
                        label: <span><HistoryOutlined /> Riwayat</span>,
                        children: (
                            <Card>
                                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                    <Col span={12}><RangePicker style={{ width: '100%' }} onChange={setDateRange} /></Col>
                                    <Col span={12}><Input placeholder="Cari Merek/Ukuran..." prefix={<SearchOutlined />} onChange={e => setSearchText(e.target.value)} /></Col>
                                </Row>
                                <Table dataSource={filteredHistoryDetail} columns={historyColumns} rowKey="id" size="small" scroll={{ x: 800 }} />
                            </Card>
                        )
                    },
                    {
                        key: '2',
                        label: <span><FileTextOutlined /> Laporan Stok Bulanan</span>,
                        children: (
                            <Card>
                                <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
                                    <Space>
                                        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} allowClear={false} />
                                        <Input placeholder="Filter produk..." style={{ width: 200 }} onChange={e => setSearchText(e.target.value)} />
                                    </Space>
                                    <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrintIframe}>Cetak Laporan</Button>
                                </Row>
                                <Table 
                                    dataSource={monthlyReportData} 
                                    columns={reportColumns} 
                                    rowKey="key" 
                                    pagination={false}
                                    summary={(pageData) => {
                                        let total = 0;
                                        pageData.forEach(({ stokAkhir }) => total += stokAkhir);
                                        return (
                                            <Table.Summary.Row style={{ background: '#fafafa' }}>
                                                <Table.Summary.Cell index={0} colSpan={5} align="right"><Text strong>TOTAL STOK GUDANG</Text></Table.Summary.Cell>
                                                <Table.Summary.Cell index={1} align="right"><Text strong style={{ fontSize: 16, color: '#1890ff' }}>{total}</Text></Table.Summary.Cell>
                                            </Table.Summary.Row>
                                        );
                                    }}
                                />
                            </Card>
                        )
                    }
                ]}
            />

            {/* MODAL EDIT RIWAYAT */}
            <Modal
                title="Edit Riwayat Stok"
                open={isEditModalOpen}
                onOk={editForm.submit}
                onCancel={() => setIsEditModalOpen(false)}
                confirmLoading={actionLoading}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
                    <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
                    <Form.Item name="perubahan" label="Jumlah (+/-)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
                    <Form.Item name="keterangan" label="Keterangan"><Input.TextArea rows={3} /></Form.Item>
                </Form>
            </Modal>
        </Spin>
    );
};

export default StokHistoryTab;