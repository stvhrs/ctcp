// ================================
// FILE: src/pages/transaksi-jual/components/TransaksiJualForm.jsx
// - MODIFIKASI TOTAL: Diubah dari "Buku" menjadi "Plate"
// - Menggunakan `plateList` prop
// - Menggunakan `harga_plate` sebagai harga satuan
// - Menyesuaikan dropdown & data yang disimpan
// - Menyesuaikan penulisan historiStok ke schema 'plate'
// ================================

import React, { useEffect, useState } from 'react';
import {
    Modal,
    Form, Input, InputNumber, Select, Button, Space, DatePicker, message, Typography,
    Row, Col, Spin, Popconfirm, Divider, Card, Statistic
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { db } from '../../../api/firebase'; // <-- PASTIKAN PATH INI BENAR
import {
    ref, update, remove, serverTimestamp,
    query, orderByKey, startAt, endAt, get, push
} from 'firebase/database';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text } = Typography;

// Helper rupiahFormatter dan rupiahParser tetap sama
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
    plateList = [],     // <-- MODIFIKASI: Prop diubah menjadi plateList
    pelangganList = [],
    onSuccess,
    loadingDependencies // Prop untuk status loading data master
}) {
    const [form] = Form.useForm();
    const [isSaving, setIsSaving] = useState(false);
    const [selectedPelanggan, setSelectedPelanggan] = useState(null);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(mode === 'create');

    // ===== Prefill saat EDIT =====
    useEffect(() => {
        // Hanya jalan saat modal dibuka
        if (open) {
            if (mode === 'edit' && initialTx) {
                console.log("Memuat data form untuk edit:", initialTx);
                try {
                    const p = pelangganList.find((x) => x.id === initialTx.idPelanggan) || null;
                    setSelectedPelanggan(p);
                    const itemsToSet = (initialTx.items && Array.isArray(initialTx.items))
                        ? initialTx.items.map((it) => ({
                            idPlate: it.idPlate, // <-- MODIFIKASI: idBuku -> idPlate
                            jumlah: it.jumlah,
                            hargaSatuan: it.hargaSatuan,
                            diskonPersen: it.diskonPersen || 0
                        }))
                        : [];

                    form.setFieldsValue({
                        nomorInvoice: initialTx.nomorInvoice || initialTx.id,
                        tanggal: initialTx.tanggal && dayjs(initialTx.tanggal).isValid() ? dayjs(initialTx.tanggal) : dayjs(),
                        idPelanggan: initialTx.idPelanggan,
                        daerah: initialTx.daerah || '',
                        keterangan: initialTx.keterangan || '',
                        diskonLain: initialTx.diskonLain || 0,
                        biayaTentu: initialTx.biayaTentu || 0,
                        items: itemsToSet,
                    });
                    console.log("Data form edit berhasil dimuat.");
                } catch (error) {
                    console.error("Gagal memuat data form edit:", error);
                    message.error("Gagal memuat data transaksi untuk diedit. Periksa konsol.");
                    onCancel(); // Tutup modal jika gagal load
                }
            } else if (mode === 'create') {
                console.log("Inisialisasi form mode create.");
                form.resetFields();
                form.setFieldsValue({
                    tanggal: dayjs(),
                    items: [{}],
                    diskonLain: 0,
                    biayaTentu: 0
                });
                setSelectedPelanggan(null); // Reset pelanggan terpilih
                setIsGeneratingInvoice(true); // Pastikan flag generate aktif
            }
        }
    }, [mode, initialTx, pelangganList, form, onCancel, open]);

    // ===== Generate nomor invoice saat CREATE =====
    useEffect(() => {
        // ... (Fungsi ini tidak berubah, path 'transaksiJualPlate' bisa tetap dipakai atau diganti) ...
        // SAYA ASUMSIKAN PATH TETAP 'transaksiJualPlate' UNTUK KONSISTENSI
        if (mode !== 'create' || !open || !isGeneratingInvoice) return;
        let isMounted = true;
        const generateInvoiceNumber = async () => {
            try {
                const now = dayjs();
                const year = now.format('YYYY');
                const month = now.format('MM');
                const keyPrefix = `INV-${year}-${month}-`;
                // JIKA ANDA INGIN PINDAH PATH, GANTI 'transaksiJualPlate' DI BAWAH INI
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
                if (isMounted) {
                    form.setFieldsValue({ nomorInvoice: displayInvoice });
                }
            } catch (e) {
                console.error("Gagal membuat nomor invoice:", e);
                if (isMounted) {
                    message.error('Gagal membuat nomor invoice. Coba tutup dan buka lagi form.');
                }
            } finally {
                if (isMounted) {
                    setIsGeneratingInvoice(false);
                }
            }
        };
        generateInvoiceNumber();
        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, open, isGeneratingInvoice]);


    // ===== MODIFIKASI: Helper harga otomatis (disederhanakan untuk plate) =====
    const getHargaOtomatis = (idPlate, pelanggan) => {
        const plate = plateList.find((p) => p.id === idPlate);
        if (!plate) return { hargaSatuan: 0, diskonPersen: 0 };

        // Logika disederhanakan: Ambil harga_plate.
        // Logika zona/spesial dihilangkan karena data plate tidak mendukungnya.
        const hargaSatuan = Number(plate.harga_plate) || 0;

        return {
            hargaSatuan: hargaSatuan,
            diskonPersen: 0, // Default diskon 0, bisa diubah manual per item
        };
    };


    // ===== Handler ganti pelanggan/plate =====
    const handlePelangganChange = (idPelanggan) => {
        const pel = pelangganList.find((p) => p.id === idPelanggan) || null;
        setSelectedPelanggan(pel);
        const items = form.getFieldValue('items') || [];
        const newItems = items.map((item) => {
            if (!item || !item.idPlate) return item; // <-- MODIFIKASI: idBuku -> idPlate
            const { hargaSatuan, diskonPersen } = getHargaOtomatis(item.idPlate, pel); // <-- MODIFIKASI
            return { ...item, hargaSatuan, diskonPersen };
        });
        form.setFieldsValue({ items: newItems });
    };

    // <-- MODIFIKASI: Ganti nama fungsi
    const handlePlateChange = (index, idPlate) => {
        const { hargaSatuan, diskonPersen } = getHargaOtomatis(idPlate, selectedPelanggan);
        const items = form.getFieldValue('items') || [];
        items[index] = { ...(items[index] || {}), idPlate, hargaSatuan, diskonPersen }; // <-- MODIFIKASI: idBuku -> idPlate
        form.setFieldsValue({ items: [...items] });
    };

    // ===== Submit (Logika disesuaikan untuk Plate) =====
    const handleFinish = async (values) => {
        console.log("Form disubmit dengan data:", values);
        setIsSaving(true);
        message.loading({ content: 'Menyimpan Transaksi...', key: 'tx', duration: 0 });
        try {
            const { idPelanggan, items, diskonLain, biayaTentu, ...data } = values;

            const nominalDiskonLain = Number(diskonLain || 0);
            const nominalBiayaTentu = Number(biayaTentu || 0);

            if (!data.nomorInvoice || !data.nomorInvoice.startsWith('INV/')) {
                throw new Error('Nomor Invoice tidak valid atau belum terbuat.');
            }
            const parts = data.nomorInvoice.split('/');
            if (parts.length !== 4) throw new Error('Format Nomor Invoice tidak dikenali.');
            const txKey = (mode === 'edit' && initialTx?.id)
                ? initialTx.id
                : `INV-${parts[1]}-${parts[2]}-${parts[3]}`;


            // <-- MODIFIKASI: Validasi item plate
            if (!items || items.length === 0 || items.some(item => !item || !item.idPlate)) {
                throw new Error('Transaksi harus memiliki minimal 1 item plate yang valid.');
            }
            const pelanggan = pelangganList.find((p) => p.id === idPelanggan);
            if (!pelanggan) throw new Error('Pelanggan tidak valid.');

            let totalTagihan = 0;
            let totalQty = 0;
            const processedItems = items.map((item, index) => {
                // <-- MODIFIKASI: Cek idPlate
                if (!item || !item.idPlate || item.jumlah == null || item.hargaSatuan == null) { throw new Error(`Data item #${index + 1} tidak lengkap.`); }
                
                // <-- MODIFIKASI: Cari di plateList
                const plate = plateList.find((p) => p.id === item.idPlate); 
                if (!plate) throw new Error(`Plate ${item.idPlate} (item #${index + 1}) tidak ditemukan`);
                
                const hargaSatuan = Number(item.hargaSatuan);
                const diskonPersen = Number(item.diskonPersen || 0);
                const jumlah = Number(item.jumlah);
                if (isNaN(hargaSatuan) || isNaN(diskonPersen) || isNaN(jumlah) || jumlah <= 0) { throw new Error(`Nilai jumlah/harga/diskon item #${index + 1} tidak valid.`); }

                const hargaFinal = Math.round(hargaSatuan * (1 - diskonPersen / 100) * jumlah);
                totalQty += jumlah;
                totalTagihan += hargaFinal;
                
                // <-- MODIFIKASI: Simpan data plate
                return {
                    idPlate: item.idPlate,
                    namaPlate: `${plate.ukuran_plate} (${plate.merek_plate})`, // Judul gabungan
                    jumlah,
                    hargaSatuan,
                    diskonPersen,
                    _plateData: plate // <- Simpan data plate mentah untuk log histori
                };
            });

            const finalTotalTagihan = totalTagihan - nominalDiskonLain + nominalBiayaTentu;


            if (!data.tanggal || !dayjs(data.tanggal).isValid()) {
                throw new Error("Tanggal transaksi tidak valid.");
            }
            
            // <-- MODIFIKASI: Bersihkan _plateData
            const cleanProcessedItems = processedItems.map(item => {
                const { _plateData, ...rest } = item;
                return rest;
            });

            const baseTx = {
                nomorInvoice: data.nomorInvoice,
                tanggal: data.tanggal.valueOf(),
                idPelanggan,
                namaPelanggan: pelanggan.nama,
                telepon: pelanggan.telepon || '',
                pelangganIsSpesial: pelanggan.isSpesial || false,
                items: cleanProcessedItems, // <-- Data item bersih
                totalTagihan: finalTotalTagihan,
                totalQty,
                daerah: data.daerah || '',
                keterangan: data.keterangan || '',
                diskonLain: nominalDiskonLain,
                biayaTentu: nominalBiayaTentu,
            };

            console.log("Mempersiapkan data simpan:", { txKey, baseTx });

            const updates = {};
            const txPath = 'transaksiJualPlate'; // GANTI INI jika path diganti
            const platePath = 'plate'; // GANTI INI jika path data plate berbeda
            const historiPath = 'historiStok'; // GANTI INI jika path histori berbeda

            if (mode === 'create') {
                updates[`${txPath}/${txKey}`] = {
                    ...baseTx,
                    jumlahTerbayar: 0,
                    statusPembayaran: 'Belum Bayar',
                    historiPembayaran: null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };

                // Update Stok (Mode Create)
                for (const item of processedItems) {
                    const plate = item._plateData;
                    const stokSebelum = Number(plate?.stok || 0);
                    const perubahan = -Math.abs(Number(item.jumlah));
                    const stokSesudah = stokSebelum + perubahan;
                    
                    updates[`${platePath}/${item.idPlate}/stok`] = stokSesudah;
                    updates[`${platePath}/${item.idPlate}/updatedAt`] = serverTimestamp();

                    // --- (HISTORI STOK CREATE) ---
                    const logKey = push(ref(db, historiPath)).key;
                    updates[`${historiPath}/${logKey}`] = {
                        plateId: plate.id, // <-- MODIFIKASI
                        ukuran: `${plate.ukuran_plate} (${plate.merek_plate})`, // <-- MODIFIKASI
                        kode_plate: plate.kode_plate || 'N/A', // <-- MODIFIKASI
                        merek: plate.merek_plate || 'N/A', // <-- MODIFIKASI
                        perubahan,
                        stokSebelum,
                        stokSesudah,
                        keterangan: `Penjualan via invoice ${data.nomorInvoice}`,
                        refId: txKey,
                        timestamp: serverTimestamp(),
                    };
                }
            } else { // EDIT MODE
                if (!initialTx?.id) throw new Error("ID transaksi edit tidak ditemukan.");
                const editTxKey = initialTx.id;
                const originalItems = initialTx.items || [];

                updates[`${txPath}/${editTxKey}`] = {
                    ...initialTx,
                    ...baseTx,
                    updatedAt: serverTimestamp()
                };

                const stockChanges = new Map();

                // <-- MODIFIKASI: Gunakan idPlate
                originalItems.forEach(item => {
                    const currentDelta = stockChanges.get(item.idPlate) || 0;
                    stockChanges.set(item.idPlate, currentDelta + Number(item.jumlah || 0));
                });

                // <-- MODIFIKASI: Gunakan idPlate
                processedItems.forEach(item => {
                    const currentDelta = stockChanges.get(item.idPlate) || 0;
                    stockChanges.set(item.idPlate, currentDelta - Number(item.jumlah || 0));
                });

                console.log("Perhitungan perubahan stok (delta):", Object.fromEntries(stockChanges));

                // <-- MODIFIKASI: Gunakan idPlate
                for (const [idPlate, deltaQty] of stockChanges.entries()) {
                    if (deltaQty === 0) continue;
                    let plate = processedItems.find(it => it.idPlate === idPlate)?._plateData;
                    if (!plate) {
                        plate = plateList.find((p) => p.id === idPlate);
                    }
                    if (!plate) {
                        console.warn(`Plate dengan ID ${idPlate} tidak ditemukan saat penyesuaian stok edit.`);
                        continue;
                    }
                    const stokSebelum = Number(plate.stok || 0);
                    const perubahan = deltaQty;
                    const stokSesudah = stokSebelum + perubahan;

                    updates[`${platePath}/${idPlate}/stok`] = stokSesudah;
                    updates[`${platePath}/${idPlate}/updatedAt`] = serverTimestamp();

                    // --- (HISTORI STOK EDIT) ---
                    const logKey = push(ref(db, historiPath)).key;
                    updates[`${historiPath}/${logKey}`] = {
                        plateId: plate.id, // <-- MODIFIKASI
                        ukuran: `${plate.ukuran_plate} (${plate.merek_plate})`, // <-- MODIFIKASI
                        kode_plate: plate.kode_plate || 'N/A', // <-- MODIFIKASI
                        merek: plate.merek_plate || 'N/A', // <-- MODIFIKASI
                        perubahan,
                        stokSebelum,
                        stokSesudah,
                        keterangan: `Penyesuaian/Retur Edit Invoice ${data.nomorInvoice}`,
                        refId: editTxKey,
                        timestamp: serverTimestamp(),
                    };
                }
            }

            console.log("Update Firebase final:", updates);
            await update(ref(db), updates);

            message.success({ content: 'Transaksi berhasil disimpan', key: 'tx' });
            form.resetFields();
            setSelectedPelanggan(null);
            onSuccess?.();
        } catch (error) {
            console.error("Gagal menyimpan transaksi:", error);
            message.error({ content: `Gagal menyimpan: ${error.message}`, key: 'tx', duration: 7 });
        } finally {
            setIsSaving(false);
        }
    };


    // ===== Delete (Edit only) =====
    const handleDelete = async () => {
        if (mode !== 'edit' || !initialTx?.id) return;
        setIsSaving(true);
        message.loading({ content: 'Menghapus transaksi & mengembalikan stok...', key: 'del_tx', duration: 0 });
        
        const txPath = 'transaksiJualPlate'; // GANTI INI jika path diganti
        const platePath = 'plate'; // GANTI INI jika path data plate berbeda
        const historiPath = 'historiStok'; // GANTI INI jika path histori berbeda

        try {
            const deleteTxKey = initialTx.id;
            const itemsToReturn = initialTx.items || [];
            const updates = {};
            updates[`${txPath}/${deleteTxKey}`] = null;
            
            for (const item of itemsToReturn) {
                // <-- MODIFIKASI: Cari di plateList
                const plate = plateList.find((p) => p.id === item.idPlate); 
                if (!plate) {
                    console.warn(`Plate ${item.idPlate} tidak ditemukan saat proses hapus/retur.`);
                    continue;
                }
                const stokSebelum = Number(plate.stok || 0);
                const perubahan = Math.abs(Number(item.jumlah || 0));
                const stokSesudah = stokSebelum + perubahan;
                updates[`${platePath}/${item.idPlate}/stok`] = stokSesudah;
                updates[`${platePath}/${item.idPlate}/updatedAt`] = serverTimestamp();

                // --- (HISTORI STOK DELETE) ---
                const logKey = push(ref(db, historiPath)).key;
                updates[`${historiPath}/${logKey}`] = {
                    plateId: plate.id, // <-- MODIFIKASI
                    ukuran: `${plate.ukuran_plate} (${plate.merek_plate})`, // <-- MODIFIKASI
                    kode_plate: plate.kode_plate || 'N/A', // <-- MODIFIKASI
                    merek: plate.merek_plate || 'N/A', // <-- MODIFIKASI
                    perubahan,
                    stokSebelum,
                    stokSesudah,
                    keterangan: `Retur Hapus Invoice ${initialTx.nomorInvoice || deleteTxKey}`,
                    refId: deleteTxKey,
                    timestamp: serverTimestamp(),
                };
            }
            console.log("Update Firebase (delete):", updates);
            await update(ref(db), updates);
            message.success({ content: 'Transaksi dihapus & stok dikembalikan.', key: 'del_tx' });
            onSuccess?.();
        } catch (e) {
            console.error("Gagal menghapus transaksi:", e);
            message.error({ content: `Gagal menghapus transaksi: ${e.message}`, key: 'del_tx' });
        } finally {
            setIsSaving(false);
        }
    };


    // ===== Subtotal item (read-only) =====
    const SubtotalField = ({ index }) => (
        // ... (Fungsi ini tidak berubah) ...
        <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
                prev.items?.[index]?.jumlah !== cur.items?.[index]?.jumlah ||
                prev.items?.[index]?.hargaSatuan !== cur.items?.[index]?.hargaSatuan ||
                prev.items?.[index]?.diskonPersen !== cur.items?.[index]?.diskonPersen
            }
        >
            {({ getFieldValue }) => {
                const jumlah = Number(getFieldValue(['items', index, 'jumlah']) || 0);
                const hargaSatuan = Number(getFieldValue(['items', index, 'hargaSatuan']) || 0);
                const diskon = Number(getFieldValue(['items', index, 'diskonPersen']) || 0);
                const subtotal = Math.round(hargaSatuan * jumlah * (1 - diskon / 100));
                return (
                    <InputNumber
                        value={subtotal} readOnly disabled formatter={rupiahFormatter} parser={rupiahParser}
                        style={{ width: '100%', textAlign: 'right', background: '#f0f2f5', color: 'rgba(0, 0, 0, 0.88)' }}
                    />
                );
            }}
        </Form.Item>
    );

    // ===== Render Form di dalam Modal =====
    return (
        <Modal
            title={mode === 'create' ? 'Tambah Transaksi Penjualan' : 'Edit Transaksi Penjualan'}
            open={open}
            onCancel={onCancel}
            width={800}
            confirmLoading={isSaving}
            destroyOnClose
            footer={null}
            maskClosable={false}
        >
            <Spin spinning={loadingDependencies} tip="Memuat data master...">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                    initialValues={{ tanggal: dayjs(), items: [{}], diskonLain: 0, biayaTentu: 0 }}
                >
                    {/* --- Header Form Responsive --- */}
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="nomorInvoice" label="Nomor Invoice" rules={[{ required: true, message: 'Nomor invoice diperlukan' }]}>
                                <Input disabled readOnly addonBefore={isGeneratingInvoice ? <Spin size="small" /> : null} placeholder={isGeneratingInvoice ? 'Membuat nomor...' : 'Nomor invoice'}/>
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true, message: 'Tanggal diperlukan' }]}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* --- Form Pelanggan, Daerah & Keterangan --- */}
                    <Form.Item name="idPelanggan" label="Pelanggan" rules={[{ required: true, message: 'Pelanggan wajib dipilih!' }]}>
                        <Select
                            showSearch
                            placeholder="Pilih pelanggan"
                            onChange={handlePelangganChange}
                            filterOption={(input, option) => (option?.children?.toString() ?? '').toLowerCase().includes(input.toLowerCase()) }
                            disabled={(isGeneratingInvoice && mode === 'create')}
                            loading={loadingDependencies}
                            notFoundContent={loadingDependencies ? <Spin size="small" /> : 'Data pelanggan tidak ditemukan'}
                        >
                            {pelangganList.map((p) => (<Option key={p.id} value={p.id}>{p.nama} {p.isSpesial && '(Spesial)'}</Option>))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="daerah" label="Daerah (Opsional)">
                        <Input placeholder="cth: Sragen, Solo, Jakarta" />
                    </Form.Item>

                    <Form.Item name="keterangan" label="Keterangan (Opsional)">
                        <Input.TextArea rows={2} placeholder="Catatan untuk transaksi ini..." />
                    </Form.Item>

                    <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>Item Plate</Typography.Title>

                    {/* --- Form.List Card --- */}
                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }, index) => {
                                    // <-- MODIFIKASI: Urutkan plateList
                                    const sortedPlateList = [...plateList].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                                    return (
                                        <Card key={key} size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }} extra={ fields.length > 1 ? (<Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />) : null }>
                                            <Row gutter={16}>
                                                {/* Kolom Plate */}
                                                <Col span={24}>
                                                    {/* <-- MODIFIKASI: name [name, 'idPlate'] */}
                                                    <Form.Item {...restField} name={[name, 'idPlate']} rules={[{ required: true, message: 'Pilih plate' }]} label={`Item #${index + 1}: Plate`} style={{ marginBottom: 8 }}>
                                                        <Select
                                                            showSearch
                                                            placeholder="Pilih Plate"
                                                            // <-- MODIFIKASI: panggil handlePlateChange
                                                            onChange={(idPlate) => handlePlateChange(index, idPlate)}
                                                            filterOption={(input, option) =>
                                                                (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                                                            }
                                                            optionLabelProp="label"
                                                            disabled={!selectedPelanggan || loadingDependencies}
                                                            loading={loadingDependencies}
                                                            notFoundContent={loadingDependencies ? <Spin size="small" /> : 'Data plate tidak ditemukan'}
                                                        >
                                                            {/* <-- MODIFIKASI: Loop sortedPlateList */}
                                                            {sortedPlateList.map((p) => (
                                                                <Option
                                                                    key={p.id}
                                                                    value={p.id}
                                                                    // <-- MODIFIKASI: Label untuk search
                                                                    label={`${p.ukuran_plate} (${p.merek_plate}) ${p.kode_plate}`}
                                                                >
                                                                    {/* <-- MODIFIKASI: Tampilan dropdown */}
                                                                    <div>
                                                                        <Text strong>{p.ukuran_plate} ({p.merek_plate})</Text>
                                                                        <br />
                                                                        <Text type="secondary" style={{ fontSize: '0.85em' }}>
                                                                            Kode: {p.kode_plate || '?'} | Stok: {p.stok ?? 0}
                                                                        </Text>
                                                                    </div>
                                                                </Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                                {/* Kolom Qty */}
                                                <Col xs={12} sm={8}><Form.Item {...restField} name={[name, 'jumlah']} rules={[{ required: true, message: 'Isi Qty' }]} initialValue={1} label="Qty" style={{ marginBottom: 8 }}><InputNumber min={1} style={{ width: '100%' }} placeholder="Jumlah" /></Form.Item></Col>
                                                {/* Kolom Diskon */}
                                                <Col xs={12} sm={8}><Form.Item {...restField} name={[name, 'diskonPersen']} initialValue={0} label="Diskon (%)" style={{ marginBottom: 8 }}><InputNumber min={0} max={100} suffix="%" style={{ width: '100%' }} placeholder="Diskon" /></Form.Item></Col>
                                                {/* Kolom Harga */}
                                                <Col xs={24} sm={8}><Form.Item {...restField} name={[name, 'hargaSatuan']} rules={[{ required: true, message: 'Isi Harga' }]} label="Harga Satuan" style={{ marginBottom: 8 }}><InputNumber placeholder="Harga" min={0} formatter={rupiahFormatter} parser={rupiahParser} style={{ width: '100%', textAlign: 'right' }} /></Form.Item></Col>
                                                {/* Kolom Subtotal */}
                                                <Col span={24}><Form.Item label="Subtotal" style={{ marginBottom: 0 }}><SubtotalField index={index} /></Form.Item></Col>
                                            </Row>
                                        </Card>
                                    )
                                })}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} disabled={!selectedPelanggan || (isGeneratingInvoice && mode === 'create') || loadingDependencies}>
                                        Tambah Item Plate {/* <-- MODIFIKASI: Teks tombol */}
                                    </Button>

                                    {!selectedPelanggan && ( <Text type="warning" style={{ display: 'block', marginTop: 8 }}> Pilih pelanggan terlebih dahulu untuk menambah item.</Text> )}
                                </Form.Item>
                            </>
                        )}
                    </Form.List>


                    {/* --- Field Diskon Lain dan Biaya Tentu (Tidak berubah) --- */}
                    <Row gutter={16} style={{ marginTop: 16 }}>
                        <Col xs={24} md={12}>
                            <Form.Item name="diskonLain" label="Diskon Tambahan (Nominal)" initialValue={0}>
                                <InputNumber
                                    min={0}
                                    formatter={rupiahFormatter}
                                    parser={rupiahParser}
                                    style={{ width: '100%', textAlign: 'right' }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="biayaTentu" label="Biaya Tambahan (Cth: Ongkir)" initialValue={0}>
                                <InputNumber
                                    min={0}
                                    formatter={rupiahFormatter}
                                    parser={rupiahParser}
                                    style={{ width: '100%', textAlign: 'right' }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>


                    {/* --- GRAND TOTAL (Tidak berubah) --- */}
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                            JSON.stringify(prev.items || []) !== JSON.stringify(cur.items || []) ||
                            prev.diskonLain !== cur.diskonLain ||
                            prev.biayaTentu !== cur.biayaTentu
                        }
                    >
                        {({ getFieldValue }) => {
                            const items = getFieldValue('items') || [];
                            const diskonLain = Number(getFieldValue('diskonLain') || 0);
                            const biayaTentu = Number(getFieldValue('biayaTentu') || 0);

                            let subtotalItems = 0;
                            let totalItemDiskon = 0;
                            let qty = 0;

                            items.forEach((it) => {
                                if (it && it.hargaSatuan != null && it.jumlah != null) {
                                    const harga = Number(it.hargaSatuan);
                                    const diskon = Number(it.diskonPersen || 0);
                                    const jml = Number(it.jumlah);
                                    if (!isNaN(harga) && !isNaN(diskon) && !isNaN(jml)) {
                                        const itemSubtotalBruto = harga * jml;
                                        const itemDiskonNominal = Math.round(itemSubtotalBruto * (diskon / 100));
                                        
                                        subtotalItems += (itemSubtotalBruto - itemDiskonNominal);
                                        totalItemDiskon += itemDiskonNominal;
                                        qty += jml;
                                    }
                                }
                            });
                            
                            const finalTotalDiskon = totalItemDiskon + diskonLain;
                            const finalGrandTotal = subtotalItems - diskonLain + biayaTentu;

                            return (
                                <>
                                    <Divider />
                                    <Row gutter={16}>
                                        <Col xs={24} md={8} style={{ marginBottom: 16 }}>
                                            {/* <-- MODIFIKASI: Judul statistic */}
                                            <Card bordered={false} style={{ backgroundColor: '#fafafa' }}><Statistic title="Total Qty Plate" value={qty} /></Card>
                                        </Col>
                                        <Col xs={24} md={8} style={{ marginBottom: 16 }}>
                                            <Card bordered={false} style={{ backgroundColor: '#fffbe6' }}><Statistic title="Total Diskon" value={finalTotalDiskon} formatter={rupiahFormatter} valueStyle={{ color: '#d46b08' }} /></Card>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Card bordered={false} style={{ backgroundColor: '#f6ffed' }}><Statistic title="Grand Total" value={finalGrandTotal} formatter={rupiahFormatter} valueStyle={{ color: '#389e0d' }} /></Card>
                                        </Col>
                                    </Row>
                                    <Divider />
                                </>
                            );
                        }}
                    </Form.Item>

                    {/* --- Tombol Aksi di dalam Modal Footer (Tidak berubah) --- */}
                    <Row justify="space-between" style={{ marginTop: 24 }}>
                        <Col>
                            {mode === 'edit' && (
                                <Popconfirm title="Hapus transaksi ini? Stok akan dikembalikan." okText="Hapus" cancelButtonText="Batal" okButtonProps={{ danger: true }} onConfirm={handleDelete} disabled={isSaving}>
                                    <Button danger type="default" loading={isSaving}> Hapus </Button>
                                </Popconfirm>
                            )}
                            <Button style={{ marginLeft: mode === 'edit' ? 8 : 0 }} onClick={onCancel} disabled={isSaving}> Batal </Button>
                        </Col>
                        <Col>
                            <Button type="primary" htmlType="submit" loading={isSaving} size="large" disabled={(isGeneratingInvoice && mode === 'create') || loadingDependencies}>
                                {mode === 'create' ? 'Simpan Transaksi' : 'Simpan Perubahan'}
                            </Button>
                        </Col>
                    </Row>
                </Form>
            </Spin>
        </Modal>
    );
}