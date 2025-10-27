import React, { useState, useMemo } from 'react';
import { Card, Table, Input, Row, Col, Typography } from 'antd';
import { timestampFormatter, numberFormatter }  from '../../../utils/formatters'; // Impor formatters
import useBukuData from '../../../hooks/useBukuData'; // Impor hook data global
import useDebounce from '../../../hooks/useDebounce'; // Impor hook debounce
const { Title, Text } = Typography;

const StokHistoryTab = () => {
    const { data: plateList, loading: plateLoading } = useBukuData(); 
    
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);

    const allHistory = useMemo(() => {
        const combinedHistory = [];
        if (!plateList || plateList.length === 0) {
            return combinedHistory;
        }

        plateList.forEach(plate => {
            if (plate.historiStok && typeof plate.historiStok === 'object') {
                Object.keys(plate.historiStok).forEach(key => {
                    combinedHistory.push({
                        id: `${plate.id}-${key}`, 
                        ...plate.historiStok[key],
                        judul: plate.historiStok[key].judul || plate.judul, 
                        kode_plate: plate.historiStok[key].kode_plate || plate.kode_plate,
                    });
                });
            }
        });

        combinedHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return combinedHistory.slice(0, 200); 
    }, [plateList]);

    const filteredHistory = useMemo(() => {
        if (!debouncedSearchText) return allHistory;
        const lowerSearch = debouncedSearchText.toLowerCase();
        return allHistory.filter(item =>
            (item.judul || '').toLowerCase().includes(lowerSearch) ||
            (item.kode_plate || '').toLowerCase().includes(lowerSearch) ||
            (item.keterangan || '').toLowerCase().includes(lowerSearch)
        );
    }, [allHistory, debouncedSearchText]);

    const historyColumns = [
        {
            title: 'Waktu', dataIndex: 'timestamp', key: 'timestamp',
            render: timestampFormatter,
            width: 150,
            fixed: 'left',
        },
        { title: 'Judul Plat', dataIndex: 'judul', key: 'judul', width: 250, fixed: 'left', },
        { title: 'Kode', dataIndex: 'kode_plate', key: 'kode_plate', width: 120 },
        {
            title: 'Perubahan', dataIndex: 'perubahan', key: 'perubahan',
            align: 'right', width: 100,
            render: (val) => {
                const num = Number(val); 
                const color = num > 0 ? '#52c41a' : (num < 0 ? '#f5222d' : '#8c8c8c');
                const prefix = num > 0 ? '+' : '';
                
                return (
                    <Text strong style={{ color: color }}>
                        {prefix}{numberFormatter(val)} 
                    </Text>
                )
            }
        },
        { title: 'Stok Awal', dataIndex: 'stokSebelum', key: 'stokSebelum', align: 'right', width: 100, render: numberFormatter },
        { title: 'Stok Akhir', dataIndex: 'stokSesudah', key: 'stokSesudah', align: 'right', width: 100, render: numberFormatter },
        { title: 'Keterangan', dataIndex: 'keterangan', key: 'keterangan', width: 200 },
    ];

    // Fungsi untuk menentukan class row
    const getRowClassName = (record, index) => {
        return 'zebra-row'; // Terapkan class ini ke semua baris
    };

    return (
        <Card>
            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                <Col>
                    <Title level={5} style={{ margin: 0 }}>Riwayat Perubahan Stok (200 Terbaru)</Title>
                </Col>
                <Col>
                    <Input.Search
                        placeholder="Cari Judul, Kode, Keterangan..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        style={{ width: 250 }}
                    />
                </Col>
            </Row>
            <Table
                columns={historyColumns}
                dataSource={filteredHistory}
                loading={plateLoading} 
                rowKey="id"
                size="small"
                scroll={{ x: 1200, y: 'calc(100vh - 350px)' }}
                pagination={{ pageSize: 50, showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} riwayat` }}
                rowClassName={getRowClassName} 
            />
        </Card>
    );
};

export default StokHistoryTab;      