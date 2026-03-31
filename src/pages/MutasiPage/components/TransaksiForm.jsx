import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Radio, Select, Upload, Button, Card, 
    Empty, Typography, Spin, message, Row, Col, Tag, Divider, Space, Badge
} from 'antd';
import { 
    UploadOutlined, DeleteOutlined, UserOutlined, FileTextOutlined, 
    WalletOutlined, BankOutlined, CalendarOutlined, CheckSquareOutlined,
    InfoCircleOutlined, ShoppingCartOutlined, DollarOutlined, ArrowRightOutlined,
    PlusOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

// --- Konfigurasi Firebase ---
import { db, storage } from '../../../api/firebase'; 
import { ref, push, update, get } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';

const { Text, Title } = Typography;
const { Option } = Select;

// ====================== CONSTANTS ======================

export const TipeTransaksi = {
    pemasukan: 'pemasukan',
    pengeluaran: 'pengeluaran',
};

export const KategoriPemasukan = {
    penjualan_plate: "Penjualan Plate",
    penjualan_sisa_palte: "Penjualan Sisa Plate",
    pemasukan_lain: "Pemasukan Lain-lain",
};

export const KategoriPengeluaran = {
    gum: "Gum",
    developer: 'Developer',
    plate: "Plate",
    gaji_produksi: "Gaji Karyawan",
    operasional: "Operasional",
    pengeluaran_lain: "Pengeluaran Lain-lain",
};

const INVOICE_PAYMENT_CATEGORIES = ['penjualan_plate'];

// ====================== UTILITIES ======================
const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

// ====================== COMPONENT ======================
const TransaksiForm = ({
    open,
    onCancel,
    initialValues,
    unpaidJual = [],
    loadingInvoices = false
}) => {
    const [form] = Form.useForm();
    const [fileList, setFileList] = useState([]);
    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const watchingTipe = Form.useWatch('tipe', form);
    const watchingKategori = Form.useWatch('kategori', form);

    const isInvoicePayment = INVOICE_PAYMENT_CATEGORIES.includes(watchingKategori);

    const payableInvoices = useMemo(() => {
        if (watchingKategori === 'penjualan_plate') {
            return unpaidJual.filter(tx => tx.statusPembayaran !== 'Lunas');
        }
        return [];
    }, [watchingKategori, unpaidJual]);

    const totalSisaSelected = useMemo(() => {
        return selectedInvoices.reduce((acc, curr) => acc + (curr.totalTagihan - (curr.jumlahTerbayar || 0)), 0);
    }, [selectedInvoices]);

    useEffect(() => {
        if (!open) {
            form.resetFields();
            setFileList([]);
            setSelectedInvoices([]);
            return;
        }

        if (initialValues) {
            const currentJumlah = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);
            form.setFieldsValue({
                ...initialValues,
                tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(initialValues.tanggalBayar),
                jumlah: currentJumlah,
                kategori: initialValues.kategori || initialValues.tipeMutasi,
                tipe: initialValues.tipe || 'pemasukan',
                metode: initialValues.metode || 'Transfer',
                idTransaksi: initialValues.idTransaksi ? [initialValues.idTransaksi] : []
            });
            if (initialValues.idTransaksi) {
                const found = unpaidJual.find(tx => tx.id === initialValues.idTransaksi);
                if (found) setSelectedInvoices([found]);
            }
            if (initialValues.buktiUrl) {
                setFileList([{ uid: '-1', name: 'Bukti Lama', status: 'done', url: initialValues.buktiUrl }]);
            }
        } else {
            form.setFieldsValue({ 
                tipe: TipeTransaksi.pemasukan, 
                tanggal: dayjs(), 
                kategori: 'pemasukan_lain', 
                metode: 'Transfer' 
            });
        }
    }, [initialValues, open, form, unpaidJual]);

    const handleTxnChange = (ids) => {
        const selectedDatas = payableInvoices.filter(tx => ids.includes(tx.id));
        setSelectedInvoices(selectedDatas);
        
        if (selectedDatas.length > 0) {
            const listNomor = selectedDatas.map(d => d.nomorInvoice).join(', ');
            const totalSisa = selectedDatas.reduce((acc, curr) => acc + (curr.totalTagihan - (curr.jumlahTerbayar || 0)), 0);
            form.setFieldsValue({
                keterangan: `Pelunasan ${selectedDatas.length} Invoice: ${listNomor}`,
                jumlah: totalSisa,
            });
        }
    };

    const selectAllInvoices = () => {
        const allIds = payableInvoices.map(tx => tx.id);
        form.setFieldsValue({ idTransaksi: allIds });
        handleTxnChange(allIds);
    };

    const onFinish = async (values) => {
        setIsSaving(true);
        const processKey = 'saving_process';
        message.loading({ content: 'Sedang menyimpan data...', key: processKey });

        try {
            const { bukti, idTransaksi, ...dataLain } = values;
            let buktiUrl = initialValues?.buktiUrl || null;

            if (bukti && bukti[0]?.originFileObj) {
                const file = bukti[0].originFileObj;
                const fileExt = file.name.split('.').pop();
                const fileName = `bukti/${uuidv4()}.${fileExt}`;
                const fileRef = storageRef(storage, fileName);
                await uploadBytes(fileRef, file);
                buktiUrl = await getDownloadURL(fileRef);
            }

            const updates = {};
            const mutasiId = initialValues?.id || push(ref(db, 'mutasi')).key;
            
            updates[`mutasi/${mutasiId}`] = {
                ...dataLain,
                idTransaksi: idTransaksi?.length === 1 ? idTransaksi[0] : 'BULK_PAYMENT',
                listInvoiceIds: idTransaksi || [],
                tanggal: dataLain.tanggal.valueOf(),
                buktiUrl,
                nama: selectedInvoices.length > 0 ? selectedInvoices[0].namaPelanggan : "Admin",
                metode: dataLain.metode,
                updatedAt: new Date().toISOString()
            };

            if (isInvoicePayment && selectedInvoices.length > 0) {
                for (const inv of selectedInvoices) {
                    const sisa = inv.totalTagihan - (inv.jumlahTerbayar || 0);
                    const invPath = `transaksiJualPlate/${inv.id}`;
                    updates[`${invPath}/jumlahTerbayar`] = (inv.jumlahTerbayar || 0) + sisa;
                    updates[`${invPath}/statusPembayaran`] = 'Lunas';
                    updates[`${invPath}/riwayatPembayaran/${mutasiId}`] = {
                        tanggal: dataLain.tanggal.valueOf(),
                        jumlah: sisa,
                        mutasiId: mutasiId,
                        keterangan: "Lunas via Pembayaran Kolektif"
                    };
                }
            }

            await update(ref(db), updates);
            message.success({ content: 'Transaksi berhasil dicatat!', key: processKey, duration: 3 });
            onCancel();
        } catch (error) {
            console.error(error);
            message.error({ content: 'Gagal: ' + error.message, key: processKey });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={
                <Space>
                    <div style={{ background: '#f0f5ff', padding: '10px', borderRadius: '10px' }}>
                        {initialValues ? <FileTextOutlined style={{ color: '#2f54eb' }} /> : <PlusOutlined style={{ color: '#2f54eb' }} />}
                    </div>
                    <div style={{ lineHeight: '1.2' }}>
                        <Title level={5} style={{ margin: 0 }}>{initialValues ? 'Detail & Edit Transaksi' : 'Catat Transaksi Baru'}</Title>
                        <Text type="secondary" style={{ fontSize: '12px' }}>Input arus kas masuk dan keluar perusahaan</Text>
                    </div>
                </Space>
            }
            onCancel={onCancel}
            width={680}
            centered
            footer={[
                <Button key="cancel" onClick={onCancel} size="large" style={{ borderRadius: '8px' }}>Batal</Button>,
                <Button key="submit" type="primary" size="large" icon={<DollarOutlined />} 
                        loading={isSaving} onClick={() => form.submit()} 
                        style={{ borderRadius: '8px', paddingInline: '32px', backgroundColor: '#2f54eb' }}>
                    Simpan Transaksi
                </Button>
            ]}
        >
            <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} style={{ marginTop: '10px' }}>
                
                {/* --- INFORMASI METADATA --- */}
                <Card size="small" style={{ borderRadius: '12px', marginBottom: '16px', background: '#fafafa', border: 'none' }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="tanggal" label={<Text strong>Tanggal</Text>} rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%', borderRadius: '6px' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="metode" label={<Text strong>Metode</Text>} rules={[{ required: true }]}>
                                <Select placeholder="Pilih Metode" style={{ borderRadius: '6px' }}>
                                    <Option value="Transfer"><Space><BankOutlined /> Transfer Bank</Space></Option>
                                    <Option value="Tunai"><Space><WalletOutlined /> Tunai / Cash</Space></Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="tipe" label={<Text strong>Jenis Arus Kas</Text>}>
                                <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
                                    <Radio.Button value="pemasukan" style={{ width: '50%', textAlign: 'center' }}>Masuk</Radio.Button>
                                    <Radio.Button value="pengeluaran" style={{ width: '50%', textAlign: 'center' }}>Keluar</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="kategori" label={<Text strong>Kategori</Text>} rules={[{ required: true }]}>
                                <Select placeholder="Pilih Kategori">
                                    {(watchingTipe === 'pemasukan' ? Object.entries(KategoriPemasukan) : Object.entries(KategoriPengeluaran))
                                        .map(([key, value]) => (<Option key={key} value={key}>{value}</Option>))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* --- SELEKSI INVOICE (SEARCH BY NAME & INVOICE) --- */}
                {isInvoicePayment && (
                    <Card size="small" 
                          title={<Space><ShoppingCartOutlined /> <Text strong>Daftar Invoice Belum Lunas</Text></Space>}
                          extra={<Button type="link" size="small" onClick={selectAllInvoices} icon={<CheckSquareOutlined />}>Pilih Semua</Button>}
                          style={{ borderRadius: '12px', marginBottom: '16px', border: '1px solid #d6e4ff', background: '#f0f5ff' }}>
                        
                        <Form.Item name="idTransaksi" style={{ marginBottom: '8px' }}>
                            <Select
                                mode="multiple"
                                showSearch // Mengaktifkan fitur pencarian
                                placeholder="🔍 Cari Nama Pelanggan atau Nomor Invoice..."
                                loading={loadingInvoices}
                                onChange={handleTxnChange}
                                optionLabelProp="label"
                                listHeight={300}
                                style={{ width: '100%' }}
                                dropdownStyle={{ borderRadius: '10px' }}
                                // LOGIKA PENCARIAN CUSTOM
                                filterOption={(input, option) => {
                                    // Mengambil string pencarian dari prop 'data-search' yang kita buat di bawah
                                    const searchString = option['data-search']?.toLowerCase() || '';
                                    return searchString.includes(input.toLowerCase());
                                }}
                            >
                                {payableInvoices.map(tx => (
                                    <Option 
                                        key={tx.id} 
                                        value={tx.id} 
                                        label={tx.nomorInvoice}
                                        // Custom attribute untuk mempermudah filter pencarian
                                        data-search={`${tx.namaPelanggan} ${tx.nomorInvoice}`}
                                    >
                                        <div style={{ padding: '4px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Text strong><UserOutlined style={{ marginRight: 6 }} /> {tx.namaPelanggan}</Text>
                                                <Tag color="blue">{tx.nomorInvoice}</Tag>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                <Text type="secondary" style={{ fontSize: '11px' }}>Sisa:</Text>
                                                <Text type="danger" strong>{currencyFormatter(tx.totalTagihan - (tx.jumlahTerbayar || 0))}</Text>
                                            </div>
                                            <Divider style={{ margin: '8px 0 0 0' }} dashed />
                                        </div>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>

                        {selectedInvoices.length > 0 && (
                            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #adc6ff' }}>
                                <Row justify="space-between" align="middle">
                                    <Col>
                                        <Badge status="processing" text={`${selectedInvoices.length} Tagihan dipilih`} />
                                    </Col>
                                    <Col>
                                        <Text type="secondary" style={{ fontSize: '12px' }}>Total Pelunasan: </Text>
                                        <Text strong style={{ fontSize: '15px', color: '#52c41a' }}>{currencyFormatter(totalSisaSelected)}</Text>
                                    </Col>
                                </Row>
                            </div>
                        )}
                    </Card>
                )}

                {/* --- NOMINAL & BUKTI --- */}
                <Card size="small" style={{ borderRadius: '12px', border: '1px solid #f0f0f0' }}>
                    <Form.Item name="jumlah" label={<Text strong>Nominal Transaksi</Text>} rules={[{ required: true }]}>
                        <InputNumber
                            prefix={<DollarOutlined style={{ color: '#bfbfbf' }} />}
                            style={{ width: '100%', borderRadius: '6px' }}
                            size="large"
                            placeholder="0"
                            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(v) => v.replace(/[^\d]/g, '')}
                        />
                    </Form.Item>

                    <Form.Item name="keterangan" label={<Text strong>Catatan</Text>}>
                        <Input.TextArea rows={2} placeholder="Keterangan transaksi..." style={{ borderRadius: '6px' }} />
                    </Form.Item>

                    <Form.Item label={<Text strong>Bukti Pembayaran</Text>} name="bukti" 
                               valuePropName="fileList" getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}>
                        <Upload listType="picture-card" maxCount={1} customRequest={({ onSuccess }) => onSuccess("ok")}>
                            {fileList.length < 1 && (
                                <div style={{ color: '#8c8c8c' }}>
                                    <PlusOutlined style={{ fontSize: '18px' }} />
                                    <div style={{ marginTop: 6 }}>Upload</div>
                                </div>
                            )}
                        </Upload>
                    </Form.Item>
                </Card>
            </Form>
        </Modal>
    );
};

export default TransaksiForm;