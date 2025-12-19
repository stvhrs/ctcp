import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Radio, Select, Upload, Button, Card, Empty, Typography, Spin,
    message, Row, Col, Tag, Divider
} from 'antd';
import { 
    UploadOutlined, DeleteOutlined, UserOutlined, FileTextOutlined, 
    WalletOutlined, BankOutlined, CalendarOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';

// --- Impor Firebase ---
import { db, storage } from '../../../api/firebase'; 
import { ref, push, update, get } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';
// --- Akhir Impor Firebase ---

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
    const [selectedTxnDetails, setSelectedTxnDetails] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, contextHolder] = Modal.useModal();

    const watchingTipe = Form.useWatch('tipe', form);
    const watchingKategori = Form.useWatch('kategori', form);

    const isInvoicePayment = INVOICE_PAYMENT_CATEGORIES.includes(watchingKategori);

    const payableInvoices = useMemo(() => {
        let list = [];
        if (watchingKategori === 'penjualan_plate') {
            list = unpaidJual.map(tx => ({ ...tx, tipeTransaksi: "Penjualan Plate" }));
        }
        return list.filter(tx => tx.statusPembayaran !== 'Lunas');
    }, [watchingKategori, unpaidJual]);

    useEffect(() => {
        if (!open) {
            form.resetFields();
            setFileList([]);
            setSelectedTxnDetails(null);
            return;
        }

        if (initialValues) {
            // --- MODE EDIT ---
            const currentJumlah = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);

            form.setFieldsValue({
                ...initialValues,
                tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(initialValues.tanggalBayar),
                jumlah: currentJumlah,
                kategori: initialValues.kategori || initialValues.tipeMutasi,
                tipe: initialValues.tipe || 'pemasukan',
                metode: initialValues.metode || 'Transfer'
            });

            if (initialValues.idTransaksi) {
                const originalTxn = [...unpaidJual].find(
                    tx => tx.id === initialValues.idTransaksi
                );

                if (originalTxn) {
                    setSelectedTxnDetails({
                        ...originalTxn,
                        jumlahTerbayar: originalTxn.jumlahTerbayar - currentJumlah,
                    });
                } else {
                    const totalTagihanEstimasi = (initialValues.totalTagihan || 0) || currentJumlah + (initialValues.sisaTagihan || 0);
                    setSelectedTxnDetails({
                        nomorInvoice: initialValues.keterangan?.split(' ')[2] || 'Invoice Tidak Ditemukan',
                        namaPelanggan: initialValues.keterangan?.split('(')[1]?.replace(')', '') || 'N/A',
                        totalTagihan: totalTagihanEstimasi,
                        jumlahTerbayar: Math.max(0, totalTagihanEstimasi - currentJumlah),
                    });
                }
            }

            if (initialValues.buktiUrl) {
                setFileList([{ uid: '-1', name: 'File terlampir', status: 'done', url: initialValues.buktiUrl }]);
            }
        } else {
            // --- MODE TAMBAH BARU ---
            form.resetFields();
            form.setFieldsValue({
                tipe: TipeTransaksi.pemasukan,
                tanggal: dayjs(),
                kategori: 'pemasukan_lain',
                metode: 'Transfer'
            });
        }
    }, [initialValues, open, form, unpaidJual]);


    const handleTipeChange = (e) => {
        const newTipe = e.target.value;
        form.setFieldsValue({
            kategori: newTipe === TipeTransaksi.pemasukan ? 'pemasukan_lain' : 'operasional',
            idTransaksi: null,
            keterangan: null,
            jumlah: null,
        });
        setSelectedTxnDetails(null);
    };

    const handleKategoriChange = () => {
        form.setFieldsValue({ idTransaksi: null, keterangan: null, jumlah: null });
        setSelectedTxnDetails(null);
    };

    const handleTxnSelect = (selectedId) => {
        const tx = payableInvoices.find(t => t.id === selectedId);
        if (tx) {
            const sisaTagihan = tx.totalTagihan - tx.jumlahTerbayar;
            setSelectedTxnDetails(tx);
            form.setFieldsValue({
                keterangan: `Pembayaran invoice ${tx.nomorInvoice} (${tx.namaPelanggan})`,
                jumlah: sisaTagihan,
                tipeTransaksi: tx.tipeTransaksi,
            });
        }
    };

    const normFile = (e) => (Array.isArray(e) ? e : e && e.fileList);

    const handleOk = () => {
        form.validateFields()
            .then(values => {
                saveTransaction(values);
            })
            .catch((info) => {
                console.log('Validate Failed:', info);
            });
    };

    const saveTransaction = async (values) => {
        setIsSaving(true);
        message.loading({ content: 'Menyimpan...', key: 'saving' });

        const { bukti, ...dataLain } = values;
        const buktiFile = (bukti && bukti.length > 0 && bukti[0].originFileObj) ? bukti[0].originFileObj : null;
        let buktiUrl = initialValues?.buktiUrl || null;

        try {
            if (buktiFile) {
                const safeKeterangan = (dataLain.keterangan || 'bukti').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
                const originalExt = buktiFile.name.split('.').pop();
                const fileName = `${safeKeterangan}-${uuidv4()}.${originalExt}`;
                const fileRef = storageRef(storage, `bukti_mutasi/${fileName}`);
                await uploadBytes(fileRef, buktiFile, { contentType: buktiFile.type });
                buktiUrl = await getDownloadURL(fileRef);
            } else if (initialValues && !bukti) {
                buktiUrl = null;
            }

            const updates = {};
            const isEditing = !!initialValues;
            const mutasiId = isEditing ? initialValues.id : push(ref(db, 'mutasi')).key;

            let dataToSave = {};
            let oldPaymentAmount = 0;
            let oldInvoiceId = null;

            if (isEditing) {
                if (initialValues.idTransaksi) {
                    oldPaymentAmount = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);
                    oldInvoiceId = initialValues.idTransaksi;
                }
            }

            let namaEntitas = "Admin";
            if (dataLain.idTransaksi) {
                const invoiceTerkait = unpaidJual.find(inv => inv.id === dataLain.idTransaksi);
                if (invoiceTerkait) {
                    namaEntitas = invoiceTerkait.namaPelanggan;
                } else if (selectedTxnDetails) {
                    namaEntitas = selectedTxnDetails.namaPelanggan;
                }
            }

            if (dataLain.idTransaksi) {
                // --- PEMBAYARAN INVOICE ---
                const newPaymentAmount = Number(dataLain.jumlah);
                dataToSave = {
                    idTransaksi: dataLain.idTransaksi,
                    tipeTransaksi: dataLain.tipeTransaksi,
                    jumlahBayar: newPaymentAmount,
                    tanggalBayar: dataLain.tanggal.valueOf(),
                    tipeMutasi: dataLain.kategori,
                    keterangan: dataLain.keterangan,
                    buktiUrl,
                    tipe: TipeTransaksi.pemasukan,
                    kategori: dataLain.kategori,
                    jumlah: newPaymentAmount,
                    tanggal: dataLain.tanggal.valueOf(),
                    nama: namaEntitas,
                    metode: dataLain.metode
                };

                updates[`mutasi/${mutasiId}`] = dataToSave;

                const invoiceDbPath = 'transaksiJualPlate';
                const invoiceRef = ref(db, `${invoiceDbPath}/${dataLain.idTransaksi}`);
                const invoiceSnapshot = await get(invoiceRef);
                if (!invoiceSnapshot.exists()) throw new Error("Invoice terkait tidak ditemukan!");

                const invoiceData = invoiceSnapshot.val();
                let currentPaid = invoiceData.jumlahTerbayar || 0;
                let currentHistory = invoiceData.riwayatPembayaran || {};

                if (isEditing) {
                    if (oldInvoiceId === dataLain.idTransaksi) {
                        currentPaid = (currentPaid - oldPaymentAmount) + newPaymentAmount;
                        currentHistory[mutasiId] = {
                            tanggal: dataLain.tanggal.valueOf(),
                            jumlah: newPaymentAmount,
                            mutasiId: mutasiId,
                            keterangan: dataToSave.keterangan
                        };
                    } else {
                        if (oldInvoiceId) {
                            const oldInvoiceDbPath = 'transaksiJualPlate';
                            const oldInvoiceRef = ref(db, `${oldInvoiceDbPath}/${oldInvoiceId}`);
                            const oldInvSnapshot = await get(oldInvoiceRef);
                            if (oldInvSnapshot.exists()) {
                                const oldInvData = oldInvSnapshot.val();
                                const oldPaid = (oldInvData.jumlahTerbayar || 0) - oldPaymentAmount;
                                const oldHistory = oldInvData.riwayatPembayaran || {};
                                delete oldHistory[mutasiId];
                                const oldStatus = (oldPaid <= 0) ? 'Belum Bayar' : (oldPaid < oldInvData.totalTagihan) ? 'DP' : 'Lunas';
                                updates[`${oldInvoiceDbPath}/${oldInvoiceId}/jumlahTerbayar`] = oldPaid;
                                updates[`${oldInvoiceDbPath}/${oldInvoiceId}/riwayatPembayaran`] = oldHistory;
                                updates[`${oldInvoiceDbPath}/${oldInvoiceId}/statusPembayaran`] = oldStatus;
                            }
                        }
                        currentPaid = currentPaid + newPaymentAmount;
                        currentHistory[mutasiId] = {
                            tanggal: dataLain.tanggal.valueOf(),
                            jumlah: newPaymentAmount,
                            mutasiId: mutasiId,
                            keterangan: dataToSave.keterangan
                        };
                    }
                } else {
                    currentPaid = currentPaid + newPaymentAmount;
                    currentHistory[mutasiId] = {
                        tanggal: dataLain.tanggal.valueOf(),
                        jumlah: newPaymentAmount,
                        mutasiId: mutasiId,
                        keterangan: dataToSave.keterangan
                    };
                }

                const newStatus = (currentPaid <= 0) ? 'Belum Bayar' : (currentPaid >= invoiceData.totalTagihan) ? 'Lunas' : 'DP';
                updates[`${invoiceDbPath}/${dataLain.idTransaksi}/jumlahTerbayar`] = currentPaid;
                updates[`${invoiceDbPath}/${dataLain.idTransaksi}/riwayatPembayaran`] = currentHistory;
                updates[`${invoiceDbPath}/${dataLain.idTransaksi}/statusPembayaran`] = newStatus;

            } else {
                // --- MUTASI UMUM ---
                const jumlah = dataLain.tipe === TipeTransaksi.pengeluaran
                    ? -Math.abs(Number(dataLain.jumlah))
                    : Number(dataLain.jumlah);

                dataToSave = {
                    jumlah,
                    kategori: dataLain.kategori,
                    keterangan: dataLain.keterangan,
                    tanggal: dataLain.tanggal.valueOf(),
                    tipe: dataLain.tipe,
                    buktiUrl,
                    tipeMutasi: dataLain.kategori,
                    nama: "Admin",
                    metode: dataLain.metode
                };

                updates[`mutasi/${mutasiId}`] = dataToSave;

                if (isEditing && oldInvoiceId) {
                    const oldInvoiceDbPath = 'transaksiJualPlate';
                    const oldInvoiceRef = ref(db, `${oldInvoiceDbPath}/${oldInvoiceId}`);
                    const oldInvSnapshot = await get(oldInvoiceRef);
                    if (oldInvSnapshot.exists()) {
                        const oldInvData = oldInvSnapshot.val();
                        const oldPaid = (oldInvData.jumlahTerbayar || 0) - oldPaymentAmount;
                        const oldHistory = oldInvData.riwayatPembayaran || {};
                        delete oldHistory[mutasiId];
                        const oldStatus = (oldPaid <= 0) ? 'Belum Bayar' : (oldPaid < oldInvData.totalTagihan) ? 'DP' : 'Lunas';
                        updates[`${oldInvoiceDbPath}/${oldInvoiceId}/jumlahTerbayar`] = oldPaid;
                        updates[`${oldInvoiceDbPath}/${oldInvoiceId}/riwayatPembayaran`] = oldHistory;
                        updates[`${oldInvoiceDbPath}/${oldInvoiceId}/statusPembayaran`] = oldStatus;
                    }
                }
            }

            await update(ref(db), updates);
            message.success({ content: isEditing ? 'Mutasi berhasil diperbarui' : 'Mutasi berhasil ditambahkan', key: 'saving', duration: 2 });
            onCancel();
        } catch (error) {
            console.error("Error saving transaction: ", error);
            message.error({ content: `Terjadi kesalahan: ${error.message}`, key: 'saving', duration: 4 });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (!initialValues) return;
        modal.confirm({
            title: 'Konfirmasi Hapus',
            content: 'Yakin hapus data ini? Saldo invoice terkait akan dikembalikan (jika ada).',
            okText: 'Ya, Hapus',
            okType: 'danger',
            cancelText: 'Batal',
            onOk: async () => {
                setIsSaving(true);
                message.loading({ content: 'Menghapus...', key: 'deleting' });
                try {
                    const mutasiId = initialValues.id;
                    const updates = {};
                    updates[`mutasi/${mutasiId}`] = null;

                    if (initialValues.idTransaksi) {
                        const paymentAmount = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);
                        const invoiceDbPath = 'transaksiJualPlate';
                        const invoiceRef = ref(db, `${invoiceDbPath}/${initialValues.idTransaksi}`);
                        const invoiceSnapshot = await get(invoiceRef);
                        if (invoiceSnapshot.exists()) {
                            const invoiceData = invoiceSnapshot.val();
                            const currentPaid = (invoiceData.jumlahTerbayar || 0) - paymentAmount;
                            const currentHistory = invoiceData.riwayatPembayaran || {};
                            delete currentHistory[mutasiId];
                            const newStatus = (currentPaid <= 0) ? 'Belum Bayar' : (currentPaid >= invoiceData.totalTagihan) ? 'Lunas' : 'DP';
                            updates[`${invoiceDbPath}/${initialValues.idTransaksi}/jumlahTerbayar`] = currentPaid;
                            updates[`${invoiceDbPath}/${initialValues.idTransaksi}/riwayatPembayaran`] = currentHistory;
                            updates[`${invoiceDbPath}/${initialValues.idTransaksi}/statusPembayaran`] = newStatus;
                        }
                    }
                    await update(ref(db), updates);
                    message.success({ content: 'Dihapus', key: 'deleting', duration: 2 });
                    onCancel();
                } catch (error) {
                    message.error({ content: `Gagal: ${error.message}`, key: 'deleting', duration: 4 });
                } finally {
                    setIsSaving(false);
                }
            },
        });
    };

    return (
        <Modal
            open={open}
            title={<Title level={4} style={{ margin: 0 }}>{initialValues ? '✏️ Edit Transaksi' : '➕ Transaksi Baru'}</Title>}
            onCancel={onCancel}
            destroyOnClose
            confirmLoading={isSaving}
            width={600}
            // --- UI 1: Posisi Top Center ---
            style={{ top: 20 }} 
            footer={[
                contextHolder,
                initialValues && (
                    <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving} style={{ float: 'left' }}>
                        Hapus
                    </Button>
                ),
                <Button key="back" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                <Button key="submit" type="primary" loading={isSaving} onClick={handleOk}>Simpan</Button>,
            ]}
        >
            <Divider style={{ margin: '12px 0 24px 0' }} />
            
            <Form form={form} layout="vertical" name="transaksi_form">
                
                {/* --- UI 2: Row/Col untuk Tampilan Dashboard yang Rapi --- */}
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true, message: 'Wajib diisi!' }]}>
                            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" suffixIcon={<CalendarOutlined />} />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="metode" label="Metode" rules={[{ required: true, message: 'Wajib dipilih!' }]}>
                            <Select placeholder="Pilih metode">
                                <Option value="Transfer"><BankOutlined /> Transfer</Option>
                                <Option value="Tunai"><WalletOutlined /> Tunai</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item name="tipe" label="Tipe Transaksi">
                            <Radio.Group onChange={handleTipeChange} disabled={!!initialValues?.idTransaksi} buttonStyle="solid" style={{ width: '100%' }}>
                                <Radio.Button value={TipeTransaksi.pemasukan} style={{ width: '50%', textAlign: 'center' }}>Masuk</Radio.Button>
                                <Radio.Button value={TipeTransaksi.pengeluaran} style={{ width: '50%', textAlign: 'center' }}>Keluar</Radio.Button>
                            </Radio.Group>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="kategori" label="Kategori" rules={[{ required: true, message: 'Wajib diisi!' }]}>
                            <Select placeholder="Pilih kategori" onChange={handleKategoriChange} disabled={!!initialValues?.idTransaksi}>
                                {(watchingTipe === TipeTransaksi.pemasukan ? Object.entries(KategoriPemasukan) : Object.entries(KategoriPengeluaran))
                                    .map(([key, value]) => (<Option key={key} value={key}>{value}</Option>))}
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                {isInvoicePayment ? (
                    <>
                         {/* --- UI 3: Dropdown Invoice yang "Rich" --- */}
                    {/* ... kode sebelumnya ... */}

                        <Form.Item
                            name="idTransaksi"
                            label="Pilih Invoice (Pelanggan)"
                            rules={[{ required: true, message: 'Invoice wajib dipilih!' }]}
                        >
                            <Select
                                showSearch
                                placeholder="🔍 Cari Invoice ID atau Nama Pelanggan..."
                                loading={loadingInvoices}
                                onSelect={handleTxnSelect}
                                disabled={!!initialValues?.idTransaksi}
                                listHeight={300}
                                // --- PERBAIKAN UTAMA DI SINI ---
                                // Gunakan 'label' agar tampilan saat dipilih beda dengan saat di list
                                optionLabelProp="label" 
                                filterOption={(input, option) => {
                                    const rawText = option['data-label'] || '';
                                    return rawText.toLowerCase().includes(input.toLowerCase());
                                }}
                                notFoundContent={loadingInvoices ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tidak ada tagihan" />}
                            >
                                {payableInvoices.map(tx => {
                                    const sisaTagihan = tx.totalTagihan - tx.jumlahTerbayar;
                                    const labelSearch = `${tx.namaPelanggan} ${tx.nomorInvoice}`;
                                    
                                    return (
                                        <Option 
                                            key={tx.id} 
                                            value={tx.id} 
                                            data-label={labelSearch}
                                            // --- TAMPILAN SAAT DIPILIH (CLEAN) ---
                                            label={
                                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                    <span>
                                                        <UserOutlined style={{ marginRight: 8 }} />
                                                        <Text strong>{tx.namaPelanggan}</Text> 
                                                        <Tag color="blue" style={{ marginLeft: 8 }}>{tx.nomorInvoice}</Tag>
                                                    </span>
                                                    {/* <Text type="danger" style={{ fontSize: 12 }}>
                                                        Sisa: {currencyFormatter(sisaTagihan)}
                                                    </Text> */}
                                                </div>
                                            }
                                        >
                                            {/* --- TAMPILAN SAAT DI LIST (RICH/DETAIL SEPERTI GAMBAR) --- */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <Text strong><UserOutlined /> {tx.namaPelanggan}</Text>
                                                <Tag color="blue">{tx.nomorInvoice}</Tag>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text type="secondary" style={{ fontSize: '11px', maxWidth: '250px' }} ellipsis>
                                                    {tx.keterangan || 'Tidak ada keterangan'}
                                                </Text>
                                                <Text type="danger" strong style={{ fontSize: '13px' }}>
                                                    Sisa: {currencyFormatter(sisaTagihan)}
                                                </Text>
                                            </div>
                                            <Divider style={{ margin: '6px 0 0 0' }} dashed />
                                        </Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>

                        {/* ... kode selanjutnya ... */}

                        <Form.Item name="tipeTransaksi" hidden><Input /></Form.Item>

                        {selectedTxnDetails && (
                            // --- UI 4: Kartu Detail yang lebih rapi ---
                            <Card 
                                size="small" 
                                style={{ marginBottom: 20, background: '#fafafa', borderColor: '#d9d9d9', borderRadius: 8 }} 
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text type="secondary">Nomor Invoice</Text>
                                    <Text strong copyable>{selectedTxnDetails.nomorInvoice}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text type="secondary">Pelanggan</Text>
                                    <Text strong>{selectedTxnDetails.namaPelanggan}</Text>
                                </div>
                                <Divider style={{ margin: '8px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text>Total Tagihan</Text>
                                    <Text>{currencyFormatter(selectedTxnDetails.totalTagihan)}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text>Sudah Dibayar</Text>
                                    <Text>{currencyFormatter(selectedTxnDetails.jumlahTerbayar)}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    <Text strong type="danger">Sisa Tagihan</Text>
                                    <Title level={5} type="danger" style={{ margin: 0 }}>
                                        {currencyFormatter(selectedTxnDetails.totalTagihan - selectedTxnDetails.jumlahTerbayar)}
                                    </Title>
                                </div>
                            </Card>
                        )}

                        <Form.Item name="keterangan" label="Keterangan">
                            <Input.TextArea rows={2} placeholder="Keterangan otomatis..." variant="filled" />
                        </Form.Item>
                    </>
                ) : (
                    <Form.Item name="keterangan" label="Keterangan" rules={[{ required: true, message: 'Wajib diisi!' }]}>
                        <Input.TextArea rows={2} placeholder="Cth: Beli Kertas A4" showCount maxLength={100} />
                    </Form.Item>
                )}

                <Form.Item
                    name="jumlah"
                    label={isInvoicePayment ? "Jumlah Bayar" : "Nominal"}
                    rules={[
                        { required: true, message: 'Wajib diisi!' },
                        { type: 'number', min: 1, message: 'Minimal 1' },
                        () => ({
                            validator(_, value) {
                                if (!isInvoicePayment || !selectedTxnDetails || !value) return Promise.resolve();
                                const sisa = selectedTxnDetails.totalTagihan - selectedTxnDetails.jumlahTerbayar;
                                if (value > sisa) return Promise.reject(new Error(`Max: ${currencyFormatter(sisa)}`));
                                return Promise.resolve();
                            },
                        }),
                    ]}
                >
                    <InputNumber
                        style={{ width: '100%' }}
                        size="large"
                        addonBefore="Rp"
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => v.replace(/[^\d]/g, '')}
                        placeholder="0"
                    />
                </Form.Item>

                <Form.Item label="Lampiran Bukti" name="bukti" valuePropName="fileList" getValueFromEvent={normFile}>
                    <Upload 
                        name="bukti" 
                        customRequest={({ onSuccess }) => onSuccess("ok")} 
                        maxCount={1} 
                        fileList={fileList} 
                        onChange={({ fileList: newFileList }) => setFileList(newFileList)} 
                        accept="image/*,.pdf"
                        listType="picture-card" // --- UI 5: Tampilan upload jadi card ---
                    >
                        {fileList.length < 1 && (
                             <div style={{ marginTop: 8 }}>
                                <FileTextOutlined style={{ fontSize: 24, color: '#999' }} />
                                <div style={{ marginTop: 8, color: '#666' }}>Upload</div>
                            </div>
                        )}
                    </Upload>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default TransaksiForm;