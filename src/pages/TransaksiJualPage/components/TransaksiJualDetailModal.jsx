// ================================
// FILE: TransaksiJualDetailModal.jsx
// MODIFIKASI:
// 1. Menambahkan perhitungan 'subtotalBarang' (Total Item sebelum biaya/potongan lain).
// 2. Menampilkan field 'Total Barang' di section Info Keuangan.
// ================================

import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Table, Typography, Tag, Timeline, Empty, Button } from 'antd';

const { Title, Text } = Typography;

// --- Helper Format ---
const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value || 0);

const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

const formatTimestamp = (timestamp) => {
    if (!timestamp) return '...';
    return new Date(timestamp).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

const TransaksiJualDetailModal = ({ open, onCancel, transaksi }) => {
    const [historiArray, setHistoriArray] = useState([]);

    // --- Persiapan Data Pembayaran ---
    useEffect(() => {
        if (open && transaksi && transaksi.riwayatPembayaran) {
            const rawRiwayat = typeof transaksi.riwayatPembayaran.forEach === 'function' 
                ? transaksi.riwayatPembayaran 
                : Object.values(transaksi.riwayatPembayaran);

            const arr = rawRiwayat.sort((a, b) => (b.tanggal || 0) - (a.tanggal || 0));
            setHistoriArray(arr);
        } else {
            setHistoriArray([]);
        }
    }, [open, transaksi]);

    // --- Definisi Kolom Tabel ---
    const itemColumns = [
        {
            title: 'No',
            key: 'no',
            align: 'center',
            width: 50,
            render: (_, __, index) => index + 1
        },
        {
            title: 'Pekerjaan',
            dataIndex: 'pekerjaan',
            key: 'pekerjaan',
            width: 150,
            render: (text) => <Text strong>{text || '-'}</Text>
        },
        {
            title: 'Merek Plate',
            key: 'merek',
            width: 120,
            render: (_, record) => {
                const match = record.namaPlate?.match(/\(([^)]+)\)/);
                return match ? match[1] : '-';
            }
        },
        {
            title: 'Ukuran Plate',
            key: 'ukuran',
            width: 120,
            render: (_, record) => {
                return record.namaPlate?.split('(')[0]?.trim() || record.namaPlate;
            }
        },
        {
            title: 'Qty',
            dataIndex: 'jumlah',
            key: 'jumlah',
            align: 'center',
            width: 60,
        },
        {
            title: 'Hrg Beli',
            dataIndex: 'hargaBeli',
            key: 'hargaBeli',
            align: 'right',
            width: 110,
            render: (val) => <span style={{ color: '#8c8c8c' }}>{formatCurrency(val)}</span>,
        },
        {
            title: 'Hrg Jual',
            dataIndex: 'hargaJual',
            key: 'hargaJual',
            align: 'right',
            width: 110,
            render: (val) => formatCurrency(val),
        },
        {
            title: 'Subtotal',
            key: 'subtotal',
            align: 'right',
            width: 130,
            render: (_, record) => {
                const subtotal = (record.jumlah || 0) * (record.hargaJual || 0);
                return <Text strong>{formatCurrency(subtotal)}</Text>;
            }
        }
    ];

    if (!transaksi) return null;

    const {
        nomorInvoice,
        tanggal,
        namaPelanggan,
        statusPembayaran,
        totalTagihan,
        jumlahTerbayar,
        items,
        diskonLain,
        biayaTentu
    } = transaksi;

    // --- LOGIKA BARU: Hitung Total Barang (Sebelum Potongan Lain & Biaya Tentu) ---
    const subtotalBarang = (items || []).reduce((acc, item) => {
        return acc + ((item.jumlah || 0) * (item.hargaJual || 0));
    }, 0);

    const sisaTagihan = (totalTagihan || 0) - (jumlahTerbayar || 0);

    const getStatusColor = (status) => {
        if (status === 'Lunas') return 'green';
        if (status === 'Belum Bayar') return 'red';
        return 'orange';
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            centered
            title={`Detail Transaksi: ${nomorInvoice || ''}`}
            width="60vw" 
            style={{ top: 20 }}
            footer={[
                <Button key="close" type="primary" onClick={onCancel}>Tutup</Button>
            ]}
        >
            {/* --- Info Header --- */}
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Pelanggan">{namaPelanggan}</Descriptions.Item>
                <Descriptions.Item label="Tanggal">{formatDate(tanggal)}</Descriptions.Item>
                <Descriptions.Item label="Status">
                    <Tag color={getStatusColor(statusPembayaran)}>{statusPembayaran}</Tag>
                </Descriptions.Item>
            </Descriptions>

            {/* --- Info Keuangan Lengkap --- */}
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 24 }}>
                {/* 1. Total Barang (Subtotal Murni) */}
                <Descriptions.Item label="Total Barang (Subtotal)" span={1}>
                    <Text>{formatCurrency(subtotalBarang)}</Text>
                </Descriptions.Item>
                
                {/* 2. Potongan Lain */}
                 <Descriptions.Item label="Potongan Lain">
                    <Text type="danger"> - {formatCurrency(diskonLain || 0)}</Text>
                </Descriptions.Item>
                
                {/* 3. Biaya Tambahan */}
                 <Descriptions.Item label="Biaya Tambahan">
                    <Text> + {formatCurrency(biayaTentu || 0)}</Text>
                </Descriptions.Item>

                {/* 4. Total Tagihan (Final) */}
                 <Descriptions.Item label="Total Tagihan (Final)">
                    <Text strong style={{ fontSize: 16 }}>{formatCurrency(totalTagihan)}</Text>
                </Descriptions.Item>
                
                {/* 5. Terbayar */}
                <Descriptions.Item label="Terbayar">
                    <Text strong style={{ color: '#3f8600' }}>{formatCurrency(jumlahTerbayar)}</Text>
                </Descriptions.Item>
                
                {/* 6. Sisa */}
                <Descriptions.Item label="Sisa">
                    <Text strong style={{ color: sisaTagihan > 0 ? '#cf1322' : '#3f8600' }}>
                        {formatCurrency(sisaTagihan)}
                    </Text>
                </Descriptions.Item>
            </Descriptions>

            {/* --- Tabel Item Plate --- */}
            <Title level={5}>Daftar Item Plate</Title>
            <Table
                columns={itemColumns}
                dataSource={items || []}
                rowKey={(item, index) => index}
                pagination={false}
                bordered
                size="small"
                scroll={{ x: 'max-content' }}
                style={{ marginBottom: 24 }}
            />

            {/* --- Riwayat Pembayaran --- */}
            <Title level={5}>Riwayat Pembayaran</Title>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', padding: 16, borderRadius: 8 }}>
                {historiArray.length > 0 ? (
                    <Timeline>
                        {historiArray.map((item, index) => (
                            <Timeline.Item key={index} color="green">
                                <Text strong style={{ color: '#3f8600' }}>{formatCurrency(item.jumlah)}</Text>
                                <br/>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {formatTimestamp(item.tanggal)} - {item.keterangan || 'Pembayaran'}
                                </Text>
                            </Timeline.Item>
                        ))}
                    </Timeline>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada pembayaran" />
                )}
            </div>
        </Modal>
    );
};

export default TransaksiJualDetailModal;