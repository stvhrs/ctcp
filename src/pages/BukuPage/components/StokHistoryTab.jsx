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
} from 'antd';
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';
import useSyncStokHistory from '../../../hooks/useSyncStokHistory.js';
import useDebounce from '../../../hooks/useDebounce';
import dayjs from 'dayjs';

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

    // Filtering utama
    const filteredHistory = useMemo(() => {
        let filteredData = [...allHistory];

        // 1. Filter Tanggal
        if (dateRange && dateRange[0] && dateRange[1]) {
            const [startDate, endDate] = dateRange;
            const start = startDate.startOf('day');
            const end = endDate.endOf('day');

            filteredData = filteredData.filter(item => {
                if (!item.timestamp) return false;
                const itemDate = dayjs(item.timestamp);
                return itemDate.isValid() && itemDate.isSameOrAfter(start) && itemDate.isSameOrBefore(end);
            });
        }

        // 2. Filter Teks
        if (debouncedSearchText) {
            const lowerSearch = debouncedSearchText.toLowerCase();
            filteredData = filteredData.filter(item =>
                (item.ukuran || '').toLowerCase().includes(lowerSearch) ||
                (item.kode_plate || '').toLowerCase().includes(lowerSearch) ||
                (item.kode_plate || '').toLowerCase().includes(lowerSearch) || // <-- DITAMBAHKAN
                (item.merek || '').toLowerCase().includes(lowerSearch) ||      // <-- DITAMBAHKAN
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

    // Kolom tabel
    const historyColumns = [
        {
            title: 'Waktu',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: timestampFormatter,
            width: 150,
            fixed: 'left',
            sorter: (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
        },
        {
            title: 'Ukuran Plate',
            dataIndex: 'ukuran_plate',
            key: 'ukuran_plate',
            width: 250,
            fixed: 'left',
        },

        { // <-- KOLOM BARU DITAMBAHKAN
            title: 'Kode Plate',
            dataIndex: 'kode_plate',
            key: 'kode_plate',
            width: 120,
        },
        { // <-- KOLOM BARU DITAMBAHKAN
            title: 'Merek',
            dataIndex: 'merek_plate',
            key: 'merek',
            width: 120,
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
                        {prefix}
                        {numberFormatter(val)}
                    </Text>
                );
            },
            sorter: (a, b) => (a.perubahan || 0) - (b.perubahan || 0),
        },
        {
            title: 'Stok Awal',
            dataIndex: 'stokSebelum',
            key: 'stokSebelum',
            align: 'right',
            width: 100,
            render: numberFormatter,
        },
        {
            title: 'Stok Akhir',
            dataIndex: 'stokSesudah',
            key: 'stokSesudah',
            align: 'right',
            width: 100,
            render: numberFormatter,
        },
        {
            title: 'Keterangan',
            dataIndex: 'keterangan',
            key: 'keterangan',
            width: 200,
        },
    ];

    const getRowClassName = () => 'zebra-row';

    const resetFilters = useCallback(() => {
        setSearchText('');
        setDateRange(null);
    }, []);

    const isFilterActive = debouncedSearchText || dateRange;

    return (
        <Spin spinning={historyLoading} tip="Memuat data riwayat...">
            <Card style={{ marginBottom: 16 }}>
                <Title level={5} style={{ margin: 0, marginBottom: 16 }}>
                    Ringkasan Riwayat (Berdasarkan Filter)
                </Title>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Card
                            size="small"
                            style={{ backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }}
                        >
                            <Statistic
                                title="Total Stok Masuk"
                                value={dashboardData.totalMasuk}
                                valueStyle={{ color: '#52c41a' }}
                                prefix="+"
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Card
                            size="small"
                            style={{ backgroundColor: '#fff1f0', border: '1px solid #ffccc7' }}
                        >
                            <Statistic
                                title="Total Stok Keluar"
                                value={dashboardData.totalKeluar}
                                valueStyle={{ color: '#f5222d' }}
                                formatter={numberFormatter}
                            />
                        </Card>
                    </Col>
                </Row>
            </Card>

            <Card>
                <Row
                    justify="space-between"
                    align="middle"
                    gutter={[16, 16]}
                    style={{ marginBottom: 16 }}
                >
                    <Col xs={24} md={8}>
                        <Title level={5} style={{ margin: 0 }}>
                            Riwayat Perubahan Stok
                        </Title>
                    </Col>
                    <Col xs={24} md={16}>
                        <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
                            {isFilterActive && (
                                <Button onClick={resetFilters} type="link">
                                    Reset Filter
                                </Button>
                            )}
                            <RangePicker
                                value={dateRange}
                                onChange={setDateRange}
                                style={{ width: 240 }}
                            />
                            <Input.Search
                                // <-- PLACEHOLDER DIPERBARUI
                                placeholder="Cari Judul, Kode, Plate, Merek..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                                style={{ width: 250 }}
                            />
                        </Space>
                    </Col>
                </Row>
                <Table
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    loading={historyLoading}
                    rowKey="id"
                    size="small"
                    // <-- SCROLL.X DIPERBARUI AGAR RAPI
                    // 1020 (lama) + 120 (Kode Plate) + 120 (Merek) = 1260
                    scroll={{ x: 1260, y: 'calc(100vh - 500px)' }}
                    pagination={{
                        defaultPageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total, range) =>
                            `${range[0]}-${range[1]} dari ${total} riwayat`,
                    }}
                    rowClassName={getRowClassName}
                />
            </Card>
        </Spin>
    );
};

export default StokHistoryTab;