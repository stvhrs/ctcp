// ================================
// FILE: src/pages/transaksi-jual/components/TransaksiJualForm.jsx
// - MODIFIKASI: Hapus Daerah
// - MODIFIKASI: Hapus Kode Plate di Dropdown (Merek + Ukuran + Stok)
// - MODIFIKASI: Item -> Hapus Diskon, Tambah Pekerjaan
// - MODIFIKASI: Split Harga -> Harga Beli (Auto) & Harga Jual (Manual)
// - MODIFIKASI: HAPUS LOGIC UPDATE STOCK (Hanya simpan transaksi)
// ================================

import React, { useEffect, useState } from 'react';
import {
    Modal,
    Form, Input, InputNumber, Select, Button,
    Row, Col, Spin, Popconfirm, Divider, Card, Statistic,DatePicker,message,
    Typography, 
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { db } from '../../../api/firebase';
import {
    ref, update, serverTimestamp,
    query, orderByKey, startAt, endAt, get
} from 'firebase/database';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text } = Typography;

const rupiahFormatter = (v) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(v || 0));

const rupiahParser = (v) => {
    const digits = String(v || '0').replace(/[^\d]/g, '');
    return Number(digits || 0);
};

export default function TransaksiJualForm({
    open,
    onCancel,
    mode = 'create',
    initialTx = null,
    plateList = [],
    pelangganList = [],
    onSuccess,
    loadingDependencies
}) {
    const [form] = Form.useForm();
    const [isSaving, setIsSaving] = useState(false);
    const [selectedPelanggan, setSelectedPelanggan] = useState(null);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(mode === 'create');

    // ===== Prefill saat EDIT =====
    useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialTx) {
                try {
                    const p = pelangganList.find((x) => x.id === initialTx.idPelanggan) || null;
                    setSelectedPelanggan(p);
                    
                    const itemsToSet = (initialTx.items && Array.isArray(initialTx.items))
                        ? initialTx.items.map((it) => ({
                            idPlate: it.idPlate,
                            pekerjaan: it.pekerjaan || '', // <-- Load Pekerjaan
                            jumlah: it.jumlah,
                            hargaBeli: it.hargaBeli || 0,   // <-- Load Harga Beli
                            hargaJual: it.hargaJual || 0,   // <-- Load Harga Jual
                        }))
                        : [];

                    form.setFieldsValue({
                        nomorInvoice: initialTx.nomorInvoice || initialTx.id,
                        tanggal: initialTx.tanggal && dayjs(initialTx.tanggal).isValid() ? dayjs(initialTx.tanggal) : dayjs(),
                        idPelanggan: initialTx.idPelanggan,
                        // Daerah dihapus
                        keterangan: initialTx.keterangan || '',
                        diskonLain: initialTx.diskonLain || 0,
                        biayaTentu: initialTx.biayaTentu || 0,
                        items: itemsToSet,
                    });
                } catch (error) {
                    console.error("Gagal memuat data form edit:", error);
                    message.error("Gagal memuat data transaksi.");
                    onCancel();
                }
            } else if (mode === 'create') {
                form.resetFields();
                form.setFieldsValue({
                    tanggal: dayjs(),
                    items: [{}],
                    diskonLain: 0,
                    biayaTentu: 0
                });
                setSelectedPelanggan(null);
                setIsGeneratingInvoice(true);
            }
        }
    }, [mode, initialTx, pelangganList, form, onCancel, open]);

    // ===== Generate nomor invoice =====
    useEffect(() => {
        if (mode !== 'create' || !open || !isGeneratingInvoice) return;
        let isMounted = true;
        const generateInvoiceNumber = async () => {
            try {
                const now = dayjs();
                const year = now.format('YYYY');
                const month = now.format('MM');
                const keyPrefix = `INV-${year}-${month}-`;
                const txRef = ref(db, 'transaksiJualPlate'); 
                const qy = query(txRef, orderByKey(), startAt(keyPrefix), endAt(keyPrefix + '\uf8ff'));
                const snapshot = await get(qy);
                let nextNum = 1;
                if (snapshot.exists()) {
                    const keys = Object.keys(snapshot.val());
                    keys.sort((a, b) => {
                        const numA = parseInt(a.split('-').pop() || '0', 10);
                        const numB = parseInt(b.split('-').pop() || '0', 10);
                        return numA - numB;
                    });
                    const lastKey = keys[keys.length - 1];
                    const lastNumStr = lastKey?.split('-').pop();
                    if (lastNumStr && !isNaN(parseInt(lastNumStr, 10))) {
                        nextNum = parseInt(lastNumStr, 10) + 1;
                    }
                }
                const newNumStr = String(nextNum).padStart(4, '0');
                const displayInvoice = `INV/${year}/${month}/${newNumStr}`;
                if (isMounted) form.setFieldsValue({ nomorInvoice: displayInvoice });
            } catch (e) {
                console.error("Error invoice:", e);
            } finally {
                if (isMounted) setIsGeneratingInvoice(false);
            }
        };
        generateInvoiceNumber();
        return () => { isMounted = false; };
    }, [mode, open, isGeneratingInvoice]);


    // ===== Helper Harga (Ambil Harga Beli dari Master) =====
    const getHargaMaster = (idPlate) => {
        const plate = plateList.find((p) => p.id === idPlate);
        if (!plate) return 0;
        return Number(plate.harga_plate) || 0; // Ini dianggap sebagai Harga Beli
    };

    // ===== Handlers =====
    const handlePelangganChange = (idPelanggan) => {
        const pel = pelangganList.find((p) => p.id === idPelanggan) || null;
        setSelectedPelanggan(pel);
        // Update harga beli jika pelanggan berubah (opsional, jika logic harga beli terpengaruh pelanggan kedepannya)
        const items = form.getFieldValue('items') || [];
        const newItems = items.map((item) => {
            if (!item || !item.idPlate) return item;
            // Harga Jual tidak direset, Harga Beli dipastikan dari master
            const hargaBeli = getHargaMaster(item.idPlate); 
            return { ...item, hargaBeli };
        });
        form.setFieldsValue({ items: newItems });
    };

    const handlePlateChange = (index, idPlate) => {
        const hargaBeli = getHargaMaster(idPlate);
        const items = form.getFieldValue('items') || [];
        
        // Saat pilih plate baru:
        // Harga Beli = dari master
        // Harga Jual = 0 (harus diisi manual admin) atau samakan dengan beli sebagai default
        items[index] = { 
            ...(items[index] || {}), 
            idPlate, 
            hargaBeli, 
            hargaJual: 0, // Default 0 agar admin sadar harus mengisi
            pekerjaan: '' 
        };
        form.setFieldsValue({ items: [...items] });
    };

    // ===== Submit Simpan =====
    const handleFinish = async (values) => {
        setIsSaving(true);
        message.loading({ content: 'Menyimpan Transaksi...', key: 'tx', duration: 0 });
        try {
            const { idPelanggan, items, diskonLain, biayaTentu, ...data } = values;

            const nominalDiskonLain = Number(diskonLain || 0);
            const nominalBiayaTentu = Number(biayaTentu || 0);
            
            // Validasi Invoice
            if (!data.nomorInvoice || !data.nomorInvoice.startsWith('INV/')) throw new Error('Nomor Invoice invalid.');
            const parts = data.nomorInvoice.split('/');
            const txKey = (mode === 'edit' && initialTx?.id) ? initialTx.id : `INV-${parts[1]}-${parts[2]}-${parts[3]}`;

            // Validasi Pelanggan
            const pelanggan = pelangganList.find((p) => p.id === idPelanggan);
            if (!pelanggan) throw new Error('Pelanggan tidak valid.');

            // Validasi Item
            if (!items || items.length === 0 || items.some(item => !item || !item.idPlate)) {
                throw new Error('Minimal 1 item plate valid diperlukan.');
            }

            let totalTagihan = 0;
            let totalQty = 0;

            const processedItems = items.map((item, index) => {
                if (!item.idPlate) throw new Error(`Item #${index + 1} belum dipilih.`);
                
                const plate = plateList.find((p) => p.id === item.idPlate);
                if (!plate) throw new Error(`Plate data tidak ditemukan untuk item #${index + 1}`);

                const jumlah = Number(item.jumlah);
                const hargaBeli = Number(item.hargaBeli); // Read only dari master
                const hargaJual = Number(item.hargaJual); // Input Admin

                if (isNaN(jumlah) || jumlah <= 0) throw new Error(`Qty item #${index+1} tidak valid.`);
                if (isNaN(hargaJual)) throw new Error(`Harga Jual item #${index+1} tidak valid.`);

                // Kalkulasi Subtotal berdasarkan HARGA JUAL
                const subtotal = hargaJual * jumlah;
                
                totalQty += jumlah;
                totalTagihan += subtotal;

                return {
                    idPlate: item.idPlate,
                    namaPlate: `${plate.ukuran_plate} (${plate.merek_plate})`,
                    pekerjaan: item.pekerjaan || '-', // <-- Simpan Pekerjaan
                    jumlah,
                    hargaBeli,  // Simpan untuk laporan laba rugi
                    hargaJual   // Harga yang dibayar customer
                };
            });

            const finalTotalTagihan = totalTagihan - nominalDiskonLain + nominalBiayaTentu;

            const baseTx = {
                nomorInvoice: data.nomorInvoice,
                tanggal: data.tanggal.valueOf(),
                idPelanggan,
                namaPelanggan: pelanggan.nama,
                telepon: pelanggan.telepon || '',
                pelangganIsSpesial: pelanggan.isSpesial || false,
                items: processedItems,
                totalTagihan: finalTotalTagihan,
                totalQty,
                // Daerah dihapus
                keterangan: data.keterangan || '',
                diskonLain: nominalDiskonLain,
                biayaTentu: nominalBiayaTentu,
            };

            const updates = {};
            const txPath = 'transaksiJualPlate';

            if (mode === 'create') {
                updates[`${txPath}/${txKey}`] = {
                    ...baseTx,
                    jumlahTerbayar: 0,
                    statusPembayaran: 'Belum Bayar',
                    historiPembayaran: null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                // MODIFIKASI: TIDAK ADA PENGURANGAN STOK
            } else {
                // EDIT MODE
                if (!initialTx?.id) throw new Error("ID transaksi edit hilang.");
                updates[`${txPath}/${initialTx.id}`] = {
                    ...initialTx,
                    ...baseTx,
                    updatedAt: serverTimestamp()
                };
                // MODIFIKASI: TIDAK ADA PENYESUAIAN STOK
            }

            await update(ref(db), updates);

            message.success({ content: 'Transaksi berhasil disimpan (Stok tidak berubah)', key: 'tx' });
            form.resetFields();
            setSelectedPelanggan(null);
            onSuccess?.();
        } catch (error) {
            console.error("Save Error:", error);
            message.error({ content: `Gagal: ${error.message}`, key: 'tx', duration: 5 });
        } finally {
            setIsSaving(false);
        }
    };

    // ===== Delete (Hapus Record Saja) =====
    const handleDelete = async () => {
        if (mode !== 'edit' || !initialTx?.id) return;
        setIsSaving(true);
        message.loading({ content: 'Menghapus transaksi...', key: 'del_tx' });
        
        try {
            const updates = {};
            updates[`transaksiJualPlate/${initialTx.id}`] = null;
            // MODIFIKASI: TIDAK ADA PENGEMBALIAN STOK

            await update(ref(db), updates);
            message.success({ content: 'Transaksi dihapus.', key: 'del_tx' });
            onSuccess?.();
        } catch (e) {
            message.error({ content: `Gagal hapus: ${e.message}`, key: 'del_tx' });
        } finally {
            setIsSaving(false);
        }
    };

    // ===== Subtotal Component (Based on Harga Jual) =====
    const SubtotalField = ({ index }) => (
        <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
                prev.items?.[index]?.jumlah !== cur.items?.[index]?.jumlah ||
                prev.items?.[index]?.hargaJual !== cur.items?.[index]?.hargaJual
            }
        >
            {({ getFieldValue }) => {
                const jumlah = Number(getFieldValue(['items', index, 'jumlah']) || 0);
                const hargaJual = Number(getFieldValue(['items', index, 'hargaJual']) || 0);
                const subtotal = jumlah * hargaJual;
                return (
                    <InputNumber
                        value={subtotal} readOnly disabled 
                        formatter={rupiahFormatter} parser={rupiahParser}
                        style={{ width: '100%', textAlign: 'right', background: '#f5f5f5', color: '#000' }}
                    />
                );
            }}
        </Form.Item>
    );

    return (
        <Modal
            title={mode === 'create' ? 'Tambah Penjualan Plate' : 'Edit Penjualan Plate'}
            open={open}
            onCancel={onCancel}
            width={900} // Lebar ditambah sedikit agar kolom muat
            confirmLoading={isSaving}
            destroyOnClose
            footer={null}
            maskClosable={false}
        >
            <Spin spinning={loadingDependencies} tip="Memuat data...">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                    initialValues={{ tanggal: dayjs(), items: [{}], diskonLain: 0, biayaTentu: 0 }}
                >
                    {/* Header: Invoice & Tanggal */}
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="nomorInvoice" label="Nomor Invoice" rules={[{ required: true }]}>
                                <Input disabled readOnly placeholder="Auto Generated..." />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Pelanggan & Keterangan (Daerah dihapus) */}
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="idPelanggan" label="Pelanggan" rules={[{ required: true, message: 'Wajib dipilih!' }]}>
                                <Select
                                    showSearch
                                    placeholder="Pilih pelanggan"
                                    onChange={handlePelangganChange}
                                    filterOption={(input, option) => (option?.children?.toString() ?? '').toLowerCase().includes(input.toLowerCase()) }
                                    disabled={(isGeneratingInvoice && mode === 'create')}
                                    loading={loadingDependencies}
                                >
                                    {pelangganList.map((p) => (<Option key={p.id} value={p.id}>{p.nama}</Option>))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                             <Form.Item name="keterangan" label="Keterangan / Catatan">
                                <Input placeholder="Opsional" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" style={{ margin: '12px 0' }}>Daftar Item Plate</Divider>

                    {/* ITEM LIST */}
                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {fields.map(({ key, name, ...restField }, index) => {
                                    const sortedPlateList = [...plateList].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                                    return (
                                        <Card key={key} size="small" style={{ backgroundColor: '#fafafa', border: '1px solid #d9d9d9' }}>
                                            <Row gutter={12}>
                                                {/* Baris 1: Pilih Plate & Pekerjaan */}
                                                <Col xs={24} md={12}>
                                                    <Form.Item {...restField} name={[name, 'idPlate']} rules={[{ required: true, message: 'Pilih plate' }]} label="Pilih Plate">
                                                        <Select
                                                            showSearch
                                                            placeholder="Cari Merek/Ukuran..."
                                                            onChange={(val) => handlePlateChange(index, val)}
                                                            filterOption={(input, option) => (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())}
                                                            disabled={!selectedPelanggan}
                                                            optionLabelProp="label"
                                                        >
                                                            {sortedPlateList.map((p) => (
                                                                <Option 
                                                                    key={p.id} 
                                                                    value={p.id}
                                                                    // Label Search & Tampilan Dropdown: Merek + Ukuran + Stok
                                                                    label={`${p.merek_plate} - ${p.ukuran_plate}`}
                                                                >
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span><b>{p.merek_plate}</b> - {p.ukuran_plate}</span>
                                                                        <span style={{ color: p.stok > 0 ? 'green' : 'red' }}>Stok: {p.stok}</span>
                                                                    </div>
                                                                </Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} md={12}>
                                                    <Form.Item {...restField} name={[name, 'pekerjaan']} label="Pekerjaan" rules={[{ required: true, message: 'Isi pekerjaan' }]}>
                                                        <Input placeholder="Nama pekerjaan/Order..." />
                                                    </Form.Item>
                                                </Col>

                                                {/* Baris 2: Qty, Harga Beli, Harga Jual, Subtotal */}
                                                <Col xs={12} md={4}>
                                                    <Form.Item {...restField} name={[name, 'jumlah']} label="Qty" initialValue={1} rules={[{ required: true }]}>
                                                        <InputNumber min={1} style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                                
                                                <Col xs={12} md={6}>
                                                    <Form.Item {...restField} name={[name, 'hargaJual']} label="Harga Jual" rules={[{ required: true, message: 'Wajib' }]}>
                                                        {/* Input Manual Admin */}
                                                        <InputNumber 
                                                            placeholder="0"
                                                            style={{ width: '100%', backgroundColor: '#fffbe6', borderColor: '#ffe58f' }} 
                                                            formatter={rupiahFormatter} parser={rupiahParser} 
                                                        />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={12} md={6}>
                                                    <Form.Item label="Subtotal">
                                                        <SubtotalField index={index} />
                                                    </Form.Item>
                                                </Col>
                                                
                                                {/* Tombol Hapus Item */}
                                                {fields.length > 1 && (
                                                    <Button 
                                                        type="text" danger icon={<DeleteOutlined />} 
                                                        onClick={() => remove(name)} 
                                                        style={{ position: 'absolute', right: 0, top: 0 }}
                                                    />
                                                )}
                                            </Row>
                                        </Card>
                                    );
                                })}
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} disabled={!selectedPelanggan}>
                                    Tambah Item Plate
                                </Button>
                            </div>
                        )}
                    </Form.List>

                    {/* Diskon Lain & Biaya Tentu */}
                    <Row gutter={16} style={{ marginTop: 24 }}>
                        <Col xs={24} md={12}>
                            <Form.Item name="diskonLain" label="Potongan Lain (Nominal)">
                                <InputNumber min={0} style={{ width: '100%' }} formatter={rupiahFormatter} parser={rupiahParser} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="biayaTentu" label="Biaya Tambahan (Ongkir/Lainnya)">
                                <InputNumber min={0} style={{ width: '100%' }} formatter={rupiahFormatter} parser={rupiahParser} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Grand Total Watcher */}
                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                            const items = getFieldValue('items') || [];
                            const diskonLain = Number(getFieldValue('diskonLain') || 0);
                            const biayaTentu = Number(getFieldValue('biayaTentu') || 0);

                            let subtotalAll = 0;
                            let totalQty = 0;

                            items.forEach(it => {
                                const qty = Number(it?.jumlah || 0);
                                const hJual = Number(it?.hargaJual || 0);
                                subtotalAll += (qty * hJual);
                                totalQty += qty;
                            });

                            const grandTotal = subtotalAll - diskonLain + biayaTentu;

                            return (
                                <Row gutter={16} style={{ marginTop: 16 }}>
                                    <Col span={8}>
                                        <Card size="small"><Statistic title="Total Item" value={totalQty} /></Card>
                                    </Col>
                                    <Col span={8}>
                                        <Card size="small"><Statistic title="Subtotal" value={subtotalAll} formatter={rupiahFormatter} /></Card>
                                    </Col>
                                    <Col span={8}>
                                        <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                                            <Statistic title="Grand Total" value={grandTotal} formatter={rupiahFormatter} valueStyle={{ color: '#389e0d', fontWeight: 'bold' }} />
                                        </Card>
                                    </Col>
                                </Row>
                            );
                        }}
                    </Form.Item>

                    {/* Actions */}
                    <Row justify="space-between" style={{ marginTop: 24 }}>
                        <Col>
                            {mode === 'edit' && (
                                <Popconfirm title="Hapus transaksi ini?" onConfirm={handleDelete} disabled={isSaving}>
                                    <Button danger>Hapus</Button>
                                </Popconfirm>
                            )}
                            <Button onClick={onCancel} style={{ marginLeft: 8 }} disabled={isSaving}>Batal</Button>
                        </Col>
                        <Col>
                            <Button type="primary" htmlType="submit" loading={isSaving} size="large">
                                Simpan Transaksi
                            </Button>
                        </Col>
                    </Row>
                </Form>
            </Spin>
        </Modal>
    );
}