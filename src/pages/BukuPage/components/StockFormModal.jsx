import React, { useState, useEffect, useMemo } from 'react';
import { 
    Modal, Form, Input, InputNumber, Row, Col, Grid, message, Spin, 
    Alert, Typography, Table, Button, DatePicker, Space, Empty 
} from 'antd';
import { 
    ref, query, orderByChild, onValue, equalTo 
} from 'firebase/database';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { db } from '../../../api/firebase';
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';
// Import fungsi service yang baru dibuat
import { updatePlateStock } from '../../../api/stokService'; 

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StokFormModal = ({ open, onCancel, plate }) => { 
    // --- 1. STATE DEFINITIONS ---
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false); // Fix: State loading untuk form
    const screens = Grid.useBreakpoint();

    // State Data History
    const [fullHistory, setFullHistory] = useState([]); 
    const [historyLoading, setHistoryLoading] = useState(false);

    // State Filter & PDF
    const [dateRange, setDateRange] = useState(null);
    const [searchText, setSearchText] = useState(''); 
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);

    // --- 2. RESET STATE SAAT MODAL DIBUKA/TUTUP ---
    useEffect(() => {
        if (!open) {
            form.resetFields();
            setDateRange(null); 
            setSearchText(''); 
            setPdfPreviewUrl(null);
            setFullHistory([]);
            setLoading(false);
        }
    }, [open, form]);

    // --- 3. FETCH DATA REALTIME (Dengan UID Key) ---
    useEffect(() => {
        if (open && plate?.id) {
            setHistoryLoading(true);
            
            // Query: Ambil historiStok dimana plateId == plate.id
            const historyRef = query(
                ref(db, 'historiStok'),
                orderByChild('plateId'), 
                equalTo(plate.id)
            );

            const unsubscribe = onValue(historyRef, (snapshot) => {
                const data = snapshot.val();
                // Fix: Mapping object ke array dengan properti 'uid'
                const loadedHistory = data
                    ? Object.keys(data).map((key) => ({ 
                        ...data[key], 
                        uid: key // Key unik Firebase disimpan di sini
                      }))
                    : [];
                
                // Sortir: Terbaru di atas (descending by timestamp)
                loadedHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                
                setFullHistory(loadedHistory);
                setHistoryLoading(false);
            }, (error) => {
                console.error("Firebase Read Error:", error);
                message.error("Gagal memuat riwayat.");
                setHistoryLoading(false);
            });

            return () => unsubscribe();
        }
    }, [open, plate?.id]);

    // --- 4. FILTERING LOGIC (Memoized) ---
    const filteredHistory = useMemo(() => {
        let data = fullHistory;

        // Filter Date Range
        if (dateRange) {
            const [start, end] = dateRange;
            const startTime = start.startOf('day').valueOf();
            const endTime = end.endOf('day').valueOf();

            data = data.filter((item) => {
                const itemTime = item.timestamp; // Pastikan timestamp di DB berupa number/millis
                return itemTime >= startTime && itemTime <= endTime;
            });
        }

        // Filter Search Text
        if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            data = data.filter((item) => {
                const ket = (item.keterangan || '').toLowerCase();
                const masuk = item.perubahan > 0 ? String(item.perubahan) : '';
                const keluar = item.perubahan < 0 ? String(Math.abs(item.perubahan)) : '';
                const sisa = String(item.stokSesudah || '');

                return ket.includes(lowerSearch) || 
                       masuk.includes(lowerSearch) || 
                       keluar.includes(lowerSearch) || 
                       sisa.includes(lowerSearch);
            });
        }

        return data;
    }, [fullHistory, dateRange, searchText]);

    // --- 5. LOGIC GENERATE PDF ---
    const handleGeneratePdf = () => {
        if (filteredHistory.length === 0) {
            message.warning("Tidak ada data untuk dicetak.");
            return;
        }

        setIsPdfGenerating(true);
        setIsPdfModalOpen(true);

        // Gunakan timeout agar UI sempat render modal loading
        setTimeout(() => {
            try {
                const doc = new jsPDF();
                
                // Header
                doc.setFontSize(16);
                doc.text(`Laporan Kartu Stok Plate`, 14, 20);
                
                doc.setFontSize(11);
                doc.setFont("helvetica", "bold");
                doc.text(`${plate.ukuran_plate} - ${plate.merek_plate}`, 14, 28);
                doc.setFont("helvetica", "normal");

                doc.setFontSize(10);
                doc.text(`Kode: ${plate.kode_plate || '-'}`, 14, 34);
                doc.text(`Stok Saat Ini: ${numberFormatter(plate.stok)}`, 14, 40);
                
                let periodeText = "Semua Riwayat";
                if (dateRange) {
                    periodeText = `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`;
                }
                if (searchText) {
                    periodeText += ` (Filter: "${searchText}")`;
                }
                doc.text(`Periode: ${periodeText}`, 14, 46);

                // Table
                const tableHead = [['No', 'Tanggal', 'Masuk', 'Keluar', 'Sisa', 'Keterangan']];
                
                const tableBody = filteredHistory.map((item, index) => {
                    const num = Number(item.perubahan || 0);
                    const masuk = num > 0 ? numberFormatter(num) : '-';
                    const keluar = num < 0 ? numberFormatter(Math.abs(num)) : '-';
                    
                    return [
                        index + 1,
                        dayjs(item.timestamp).format('DD/MM/YY HH:mm'),
                        masuk,
                        keluar,
                        numberFormatter(item.stokSesudah),
                        item.keterangan || '-' 
                    ];
                });

                autoTable(doc, {
                    startY: 52,
                    head: tableHead,
                    body: tableBody,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 2, valign: 'middle' },
                    headStyles: { fillColor: [41, 128, 185], halign: 'center', textColor: 255 },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 10 },
                        1: { cellWidth: 35 },
                        2: { halign: 'right', textColor: [0, 150, 0], cellWidth: 25 },
                        3: { halign: 'right', textColor: [200, 0, 0], cellWidth: 25 },
                        4: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
                        5: { cellWidth: 'auto' }
                    }
                });

                const blob = doc.output('blob');
                setPdfPreviewUrl(URL.createObjectURL(blob));
            } catch (error) {
                console.error("PDF Error:", error);
                message.error("Gagal membuat PDF.");
            } finally {
                setIsPdfGenerating(false);
            }
        }, 100);
    };

    // --- 6. HANDLE UPDATE STOK (Menggunakan Service) ---
    const handleStokUpdate = async (values) => {
        const { jumlah, keterangan } = values;
        const jumlahNum = Number(jumlah);

        if (isNaN(jumlahNum) || jumlahNum === 0) {
            message.error('Jumlah tidak boleh 0.');
            return;
        }

        setLoading(true); 

        try {
            await updatePlateStock({
                plateId: plate.id,
                quantity: jumlahNum,
                keterangan: keterangan,
                // Mengirim metadata agar history lengkap meski plate master berubah nanti
                metadata: {
                    kode_plate: plate.kode_plate,
                    merek_plate: plate.merek_plate,
                    ukuran_plate: plate.ukuran_plate
                }
            });

            message.success('Stok berhasil diperbarui.');
            form.resetFields();
            // Optional: onCancel(); jika ingin menutup modal otomatis
        } catch (error) {
            console.error(error);
            message.error('Gagal update stok: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- 7. TABLE COLUMNS ---
    const modalHistoryColumns = [
        { title: 'Waktu', dataIndex: 'timestamp', width: 140, render: timestampFormatter },
        { 
            title: 'Masuk', dataIndex: 'perubahan', width: 80, align: 'right',
            render: (val) => Number(val) > 0 ? <Text type="success">{numberFormatter(val)}</Text> : <Text type="secondary">-</Text> 
        },
        { 
            title: 'Keluar', dataIndex: 'perubahan', width: 80, align: 'right',
            render: (val) => Number(val) < 0 ? <Text type="danger">{numberFormatter(Math.abs(val))}</Text> : <Text type="secondary">-</Text> 
        },
        { title: 'Sisa', dataIndex: 'stokSesudah', width: 80, align: 'right', render: (val) => <Text strong>{numberFormatter(val)}</Text> },
        { 
            title: 'Keterangan', 
            dataIndex: 'keterangan', 
            ellipsis: true,
            render: (text) => {
                if (!searchText) return text;
                const parts = text.split(new RegExp(`(${searchText})`, 'gi'));
                return (
                    <span>
                        {parts.map((part, i) => 
                            part.toLowerCase() === searchText.toLowerCase() 
                                ? <span key={i} style={{ backgroundColor: '#ffc069' }}>{part}</span> 
                                : part
                        )}
                    </span>
                );
            }
        },
    ];

    if (!plate) return null;

    return (
        <>
            <Modal
                title={`Kartu Stok: ${plate.ukuran_plate} - ${plate.merek_plate}`}
                open={open}
                onCancel={onCancel}
                footer={null}
                destroyOnClose
                width={1300}
                style={{ top: 20 }}
            >
                <Spin spinning={loading && !historyLoading}> 
                    <Row gutter={24}>
                        {/* KIRI: FORM UPDATE */}
                        <Col lg={7} xs={24} style={{ borderRight: screens.lg ? '1px solid #f0f0f0' : 'none', marginBottom: 24 }}>
                            <Title level={5}>Update Stok Manual</Title>
                            <Alert message={`Stok Saat Ini: ${numberFormatter(plate.stok)}`} type="info" showIcon style={{ marginBottom: 16 }} />
                            
                            <Form form={form} layout="vertical" onFinish={handleStokUpdate} initialValues={{ jumlah: null, keterangan: '' }}>
                                <Form.Item name="jumlah" label="Jumlah (+ Masuk / - Keluar)" rules={[{ required: true, message: 'Wajib diisi' }]}>
                                    <InputNumber style={{ width: '100%' }} placeholder="Contoh: 50 atau -10" size="large" />
                                </Form.Item>
                                <Form.Item name="keterangan" label="Keterangan">
                                    <Input.TextArea rows={2} placeholder="Contoh: Barang Rusak / Restock" />
                                </Form.Item>
                                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                                    Simpan Perubahan
                                </Button>
                            </Form>
                        </Col>

                        {/* KANAN: TABEL RIWAYAT */}
                        <Col lg={17} xs={24}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                <Title level={5} style={{ margin: 0 }}>Riwayat Mutasi Stok</Title>
                                <Space wrap>
                                    <Input 
                                        prefix={<SearchOutlined />} 
                                        placeholder="Cari ket / angka..." 
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        allowClear
                                        style={{ width: 180 }}
                                    />
                                    <RangePicker 
                                        value={dateRange} 
                                        onChange={setDateRange} 
                                        format="DD/MM/YYYY"
                                        placeholder={['Mulai', 'Selesai']}
                                        style={{ width: 220 }}
                                        allowClear={true} 
                                    />
                                    <Button 
                                        icon={<PrinterOutlined />} 
                                        onClick={handleGeneratePdf}
                                        loading={isPdfGenerating}
                                        disabled={historyLoading || filteredHistory.length === 0}
                                    >
                                        Print PDF
                                    </Button>
                                </Space>
                            </div>

                            <Table
                                columns={modalHistoryColumns}
                                dataSource={filteredHistory}
                                loading={historyLoading}
                                rowKey="uid" // Fix Unique Key Error
                                pagination={{ pageSize: 8, size: 'small', showTotal: (total) => `Total ${total} riwayat` }}
                                size="small"
                                scroll={{ x: 'max-content' }}
                                bordered
                            />
                        </Col>
                    </Row>
                </Spin>
            </Modal>

            {/* MODAL PREVIEW PDF */}
            <Modal
                title="Preview Laporan Stok"
                open={isPdfModalOpen}
                onCancel={() => { setIsPdfModalOpen(false); setPdfPreviewUrl(null); }}
                width="80vw"
                style={{ top: 20 }}
                footer={[<Button key="close" onClick={() => setIsPdfModalOpen(false)}>Tutup</Button>]}
                bodyStyle={{ padding: 0, height: '80vh' }}
            >
                {isPdfGenerating ? (
                    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>Membuat PDF...</div>
                    </div>
                ) : pdfPreviewUrl ? (
                    <iframe src={pdfPreviewUrl} width="100%" height="100%" style={{ border: 'none' }} title="PDF Preview" />
                ) : (
                    <Empty description="Gagal memuat preview PDF" style={{ marginTop: 100 }} />
                )}
            </Modal>
        </>
    );
};

export default StokFormModal;