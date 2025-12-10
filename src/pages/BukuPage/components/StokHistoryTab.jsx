import React, { useState, useMemo, useCallback } from 'react';
import {
    Card,
    Table,
    Input,
    Row,
    Col,
    Typography,
    DatePicker,
    Statistic,
    Button,
    Space,
    Spin,
    Popconfirm,
    message,
    Modal,
    Form,
    InputNumber,
    Alert
} from 'antd';
import { 
    EditOutlined, 
    DeleteOutlined, 
    ExclamationCircleOutlined 
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
const { RangePicker } = DatePicker;

const StokHistoryTab = () => {
    const { data: allHistory, loading: historyLoading } = useSyncStokHistory();

    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [dateRange, setDateRange] = useState(null);

    // --- STATE UNTUK EDIT ---
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editForm] = Form.useForm();
    const [actionLoading, setActionLoading] = useState(false);

    // --- 1. HANDLE DELETE (Hapus Riwayat & Kembalikan Stok) ---
    const handleDelete = async (record) => {
        if (!record.plateId || !record.id) {
            message.error("Data tidak valid (ID Plate hilang).");
            return;
        }

        setActionLoading(true);
        try {
            // A. Update Master Stok (Reverse effect)
            const plateRef = ref(db, `plate/${record.plateId}`);
            
            await runTransaction(plateRef, (currentData) => {
                if (!currentData) return;
                const stokSaatIni = Number(currentData.stok) || 0;
                const perubahanHistory = Number(record.perubahan) || 0;
                
                // Rumus Reverse: Stok Baru = Stok Lama - Perubahan History
                return {
                    ...currentData,
                    stok: stokSaatIni - perubahanHistory
                };
            });

            // B. Hapus data di historiStok
            await remove(ref(db, `historiStok/${record.id}`));

            message.success("Riwayat dihapus dan stok dikembalikan.");
        } catch (error) {
            console.error("Delete Error:", error);
            message.error("Gagal menghapus: " + error.message);
        } finally {
            setActionLoading(false);
        }
    };

    // --- 2. HANDLE EDIT (Buka Modal) ---
    const openEditModal = (record) => {
        setEditingItem(record);
        editForm.setFieldsValue({
            tanggal: record.tanggal ? dayjs(record.tanggal) : dayjs(record.timestamp),
            perubahan: record.perubahan,
            keterangan: record.keterangan
        });
        setIsEditModalOpen(true);
    };

    // --- 3. SUBMIT EDIT (Update Stok & History) ---
    const handleEditSubmit = async () => {
        try {
            const values = await editForm.validateFields();
            setActionLoading(true);

            const oldQty = Number(editingItem.perubahan);
            const newQty = Number(values.perubahan);
            const diff = newQty - oldQty; // Selisih perubahan

            // A. Jika jumlah berubah, Update Master Stok
            if (diff !== 0) {
                const plateRef = ref(db, `plate/${editingItem.plateId}`);
                await runTransaction(plateRef, (currentData) => {
                    if (!currentData) return;
                    const stokSaatIni = Number(currentData.stok) || 0;
                    return {
                        ...currentData,
                        stok: stokSaatIni + diff 
                    };
                });
            }

            // B. Update Data History
            const updates = {
                tanggal: values.tanggal.format('YYYY-MM-DD'),
                perubahan: newQty,
                keterangan: values.keterangan,
                // Update stokSesudah di record ini (kosmetik)
                stokSesudah: (Number(editingItem.stokSebelum) || 0) + newQty 
            };

            await update(ref(db, `historiStok/${editingItem.id}`), updates);

            message.success("Riwayat diperbarui.");
            setIsEditModalOpen(false);
            setEditingItem(null);
        } catch (error) {
            console.error("Edit Error:", error);
            message.error("Gagal update: " + error.message);
        } finally {
            setActionLoading(false);
        }
    };

    // --- FILTERING ---
    const filteredHistory = useMemo(() => {
        let filteredData = [...allHistory];

        // 1. Filter Tanggal
        if (dateRange && dateRange[0] && dateRange[1]) {
            const [startDate, endDate] = dateRange;
            const start = startDate.startOf('day');
            const end = endDate.endOf('day');

            filteredData = filteredData.filter(item => {
                const checkDate = item.tanggal ? dayjs(item.tanggal) : dayjs(item.timestamp);
                return checkDate.isValid() && checkDate.isSameOrAfter(start) && checkDate.isSameOrBefore(end);
            });
        }

        // 2. Filter Teks (Diperbarui untuk Merek & Ukuran)
        if (debouncedSearchText) {
            const lowerSearch = debouncedSearchText.toLowerCase();
            filteredData = filteredData.filter(item =>
                (item.merek_plate || '').toLowerCase().includes(lowerSearch) || 
                (item.ukuran_plate || '').toLowerCase().includes(lowerSearch) ||
                (item.keterangan || '').toLowerCase().includes(lowerSearch)
            );
        }

        return filteredData;
    }, [allHistory, debouncedSearchText, dateRange]);

    // Ringkasan dashboard
    const dashboardData = useMemo(() => {
        return filteredHistory.reduce(
            (acc, item) => {
                const perubahan = Number(item.perubahan) || 0;
                if (perubahan > 0) acc.totalMasuk += perubahan;
                else if (perubahan < 0) acc.totalKeluar += perubahan;
                return acc;
            },
            { totalMasuk: 0, totalKeluar: 0 }
        );
    }, [filteredHistory]);

    // --- KOLOM TABEL (MODIFIKASI: SPLIT MEREK & UKURAN) ---
    const historyColumns = [
        {
            title: 'Tanggal',
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 110,
            fixed: 'left',
            render: (val, record) => val ? val : timestampFormatter(record.timestamp),
            sorter: (a, b) => (dayjs(a.tanggal || a.timestamp).unix()) - (dayjs(b.tanggal || b.timestamp).unix()),
        },
        // --- Kolom Merek (Baru) ---
        {
            title: 'Merek',
            dataIndex: 'merek_plate',
            key: 'merek_plate',
            width: 120,
            fixed: 'left',
            sorter: (a, b) => (a.merek_plate || '').localeCompare(b.merek_plate || ''),
            render: (text) => <Text strong>{text || '-'}</Text>
        },
        // --- Kolom Ukuran (Baru) ---
        {
            title: 'Ukuran',
            dataIndex: 'ukuran_plate',
            key: 'ukuran_plate',
            width: 140,
            fixed: 'left',
        },
        {
            title: 'Perubahan',
            dataIndex: 'perubahan',
            key: 'perubahan',
            align: 'right',
            width: 100,
            render: val => {
                const num = Number(val);
                const color = num > 0 ? '#52c41a' : num < 0 ? '#f5222d' : '#8c8c8c';
                const prefix = num > 0 ? '+' : '';
                return (
                    <Text strong style={{ color }}>
                        {prefix}{numberFormatter(val)}
                    </Text>
                );
            },
            sorter: (a, b) => (a.perubahan || 0) - (b.perubahan || 0),
        },
        {
            title: 'Sblm',
            dataIndex: 'stokSebelum',
            key: 'stokSebelum',
            align: 'right',
            width: 80,
            render: numberFormatter,
        },
        {
            title: 'Ssdh',
            dataIndex: 'stokSesudah',
            key: 'stokSesudah',
            align: 'right',
            width: 80,
            render: numberFormatter,
        },
        {
            title: 'Keterangan',
            dataIndex: 'keterangan',
            key: 'keterangan',
            width: 250,
        },
        {
            title: 'Aksi',
            key: 'aksi',
            width: 100,
            fixed: 'right',
            render: (_, record) => (
                <Space>
                    <Button 
                        icon={<EditOutlined />} 
                        size="small" 
                        onClick={() => openEditModal(record)} 
                        disabled={actionLoading}
                    />
                    <Popconfirm
                        title="Hapus Riwayat?"
                        description={
                            <div style={{ maxWidth: 200 }}>
                                Menghapus ini akan <b>mengembalikan stok</b> plate sejumlah {record.perubahan * -1}.
                                <br/><br/>Lanjutkan?
                            </div>
                        }
                        onConfirm={() => handleDelete(record)}
                        okText="Ya, Hapus"
                        cancelText="Batal"
                        icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                    >
                        <Button 
                            icon={<DeleteOutlined />} 
                            size="small" 
                            danger 
                            disabled={actionLoading}
                        />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const getRowClassName = () => 'zebra-row';

    const resetFilters = useCallback(() => {
        setSearchText('');
        setDateRange(null);
    }, []);

    const isFilterActive = debouncedSearchText || dateRange;

    return (
        <Spin spinning={historyLoading} tip="Memuat data riwayat...">
            {/* --- DASHBOARD STATISTIK --- */}
            <Card style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Card size="small" style={{ backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }}>
                            <Statistic
                                title="Total Stok Masuk (Filter)"
                                value={dashboardData.totalMasuk}
                                valueStyle={{ color: '#52c41a' }}
                                prefix="+"
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Card size="small" style={{ backgroundColor: '#fff1f0', border: '1px solid #ffccc7' }}>
                            <Statistic
                                title="Total Stok Keluar (Filter)"
                                value={dashboardData.totalKeluar}
                                valueStyle={{ color: '#f5222d' }}
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                </Row>
            </Card>

            {/* --- TABEL & FILTER --- */}
            <Card>
                <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <Title level={5} style={{ margin: 0 }}>
                            Riwayat Perubahan Stok
                        </Title>
                    </Col>
                    <Col xs={24} md={16}>
                        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
                            {isFilterActive && (
                                <Button onClick={resetFilters} type="link">Reset Filter</Button>
                            )}
                            <RangePicker
                                value={dateRange}
                                onChange={setDateRange}
                                style={{ width: 240 }}
                            />
                            <Input.Search
                                placeholder="Cari Merek, Ukuran, Keterangan..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                                style={{ width: 260 }}
                            />
                        </Space>
                    </Col>
                </Row>
                <Table
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    loading={historyLoading || actionLoading}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1000, y: 'calc(100vh - 500px)' }}
                    pagination={{
                        defaultPageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} riwayat`,
                    }}
                    rowClassName={getRowClassName}
                />
            </Card>

            {/* --- MODAL EDIT --- */}
            <Modal
                title="Edit Riwayat Stok"
                open={isEditModalOpen}
                onOk={editForm.submit}
                onCancel={() => {
                    setIsEditModalOpen(false);
                    setEditingItem(null);
                }}
                confirmLoading={actionLoading}
                destroyOnClose
            >
                <Alert 
                    message="Perhatian" 
                    description="Mengubah jumlah 'Perubahan' akan otomatis mengoreksi stok plate saat ini." 
                    type="warning" 
                    showIcon 
                    style={{ marginBottom: 16 }}
                />
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleEditSubmit}
                >
                    <Form.Item
                        name="tanggal"
                        label="Tanggal Transaksi"
                        rules={[{ required: true, message: 'Pilih tanggal' }]}
                    >
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>

                    <Form.Item
                        name="perubahan"
                        label="Jumlah Perubahan (+ Masuk / - Keluar)"
                        rules={[
                            { required: true, message: 'Isi jumlah' },
                            { type: 'number', message: 'Harus angka' },
                            { validator: (_, value) => value !== 0 ? Promise.resolve() : Promise.reject('Tidak boleh 0') }
                        ]}
                    >
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="keterangan"
                        label="Keterangan"
                    >
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Spin>
    );
};

export default StokHistoryTab;