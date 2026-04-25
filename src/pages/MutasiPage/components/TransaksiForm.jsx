import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Radio, Select, Upload, Button, Card, Empty, Typography, Spin,
    message, Row, Col, Tag, Divider, Table, Checkbox, Alert, Statistic
} from 'antd';
import { 
    UploadOutlined, DeleteOutlined, CheckCircleOutlined, LockOutlined,
    WalletOutlined, BankOutlined, CalendarOutlined, ExclamationCircleOutlined,
    CalculatorOutlined, ClockCircleOutlined, ArrowRightOutlined, DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

// --- Impor Firebase ---
import { db, storage } from '../../../api/firebase'; 
import { ref, push, update, get } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';

const { Text, Title } = Typography;
const { Option } = Select;

const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const TransaksiForm = ({ open, onCancel, initialValues, unpaidJual = [] }) => {
    const [form] = Form.useForm();
    const [fileList, setFileList] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    
    // State Kontrol Pembayaran
    const [selectedInvoiceKeys, setSelectedInvoiceKeys] = useState([]);
    const [manualPayments, setManualPayments] = useState({}); 
    const isInternalUpdate = useRef(false);

    const [viewedInvoice, setViewedInvoice] = useState(null);
    const [loadingViewedInvoice, setLoadingViewedInvoice] = useState(false);
    const [modal, contextHolder] = Modal.useModal();

    const isEditMode = !!initialValues;
    const watchingTipe = Form.useWatch('tipe', form);
    const watchingKategori = Form.useWatch('kategori', form);
    const watchingPelanggan = Form.useWatch('idPelanggan', form);
    const watchingTotalInput = Form.useWatch('jumlah', form);

    const isInvoiceMode = watchingTipe === 'pemasukan' && watchingKategori === 'penjualan_plate';

    // 1. Data Invoice & Urutan FIFO (Terlama)
    const availableInvoices = useMemo(() => {
        if (!watchingPelanggan || !isInvoiceMode || isEditMode) return [];
        return unpaidJual
            .filter(inv => inv.idPelanggan === watchingPelanggan && inv.statusPembayaran !== 'Lunas')
            .sort((a, b) => a.tanggal - b.tanggal);
    }, [watchingPelanggan, unpaidJual, isInvoiceMode, isEditMode]);

    const totalPiutang = useMemo(() => 
        availableInvoices.reduce((acc, inv) => acc + (inv.totalTagihan - (inv.jumlahTerbayar || 0)), 0)
    , [availableInvoices]);

    // 2. Logic: Ketik di TOTAL -> Auto Fill ke bawah (FIFO)
    useEffect(() => {
        if (isEditMode || !isInvoiceMode || isInternalUpdate.current) return;
        let remaining = watchingTotalInput || 0;
        const newPayments = {};
        const newKeys = [];
        for (const inv of availableInvoices) {
            if (remaining <= 0) break;
            const sisa = inv.totalTagihan - (inv.jumlahTerbayar || 0);
            const taken = Math.min(remaining, sisa);
            newPayments[inv.id] = taken;
            newKeys.push(inv.id);
            remaining -= taken;
        }
        isInternalUpdate.current = true;
        setManualPayments(newPayments);
        setSelectedInvoiceKeys(newKeys);
        setTimeout(() => { isInternalUpdate.current = false; }, 50);
    }, [watchingTotalInput, availableInvoices, isInvoiceMode, isEditMode]);

    // 3. Logic: Isi di TABEL -> Auto Sum ke Field TOTAL di atas
    const syncTableToTotal = (keys, payments) => {
        if (isInternalUpdate.current) return;
        const sum = keys.reduce((acc, key) => acc + (payments[key] || 0), 0);
        isInternalUpdate.current = true;
        form.setFieldsValue({ jumlah: sum });
        setTimeout(() => { isInternalUpdate.current = false; }, 50);
    };

    const fetchCustomers = async () => {
        setLoadingCustomers(true);
        try {
            const snap = await get(ref(db, 'pelanggan'));
            if (snap.exists()) {
                const list = Object.entries(snap.val()).map(([id, v]) => ({ id, nama: v.nama }));
                setCustomerOptions(list.sort((a, b) => a.nama.localeCompare(b.nama)));
            }
        } finally { setLoadingCustomers(false); }
    };

    useEffect(() => {
        if (open) {
            fetchCustomers();
            if (initialValues) {
                form.setFieldsValue({ ...initialValues, tanggal: dayjs(initialValues.tanggal), jumlah: Math.abs(initialValues.jumlah) });
                if (initialValues.buktiUrl) setFileList([{ uid: '-1', name: 'Bukti', status: 'done', url: initialValues.buktiUrl }]);
                if (initialValues.idTransaksi) {
                    setLoadingViewedInvoice(true);
                    get(ref(db, `transaksiJualPlate/${initialValues.idTransaksi}`)).then(s => {
                        if (s.exists()) setViewedInvoice(s.val());
                        setLoadingViewedInvoice(false);
                    });
                }
            } else {
                form.setFieldsValue({ tipe: 'pemasukan', tanggal: dayjs(), kategori: 'pemasukan_lain', metode: 'Transfer' });
            }
        } else {
            form.resetFields(); setFileList([]); setSelectedInvoiceKeys([]); setManualPayments({}); setViewedInvoice(null);
        }
    }, [open, initialValues]);

    const handleCheckboxChange = (id, checked, sisa) => {
        const nextKeys = checked ? [...selectedInvoiceKeys, id] : selectedInvoiceKeys.filter(k => k !== id);
        const nextPayments = { ...manualPayments, [id]: checked ? sisa : 0 };
        setSelectedInvoiceKeys(nextKeys);
        setManualPayments(nextPayments);
        syncTableToTotal(nextKeys, nextPayments);
    };

    const handleManualAmountChange = (id, val) => {
        const nominal = val || 0;
        let nextKeys = [...selectedInvoiceKeys];
        if (nominal > 0 && !nextKeys.includes(id)) nextKeys.push(id);
        else if (nominal <= 0) nextKeys = nextKeys.filter(k => k !== id);
        const nextPayments = { ...manualPayments, [id]: nominal };
        setSelectedInvoiceKeys(nextKeys);
        setManualPayments(nextPayments);
        syncTableToTotal(nextKeys, nextPayments);
    };

    const onFinish = async (values) => {
        if (isEditMode || isSaving) return;
        setIsSaving(true);
        try {
            const updates = {};
            const timestamp = Date.now();
            let buktiUrl = null;
            if (values.bukti?.[0]?.originFileObj) {
                const fRef = storageRef(storage, `mutasi/${uuidv4()}`);
                await uploadBytes(fRef, values.bukti[0].originFileObj);
                buktiUrl = await getDownloadURL(fRef);
            }
            const customer = customerOptions.find(c => c.id === values.idPelanggan);
            const namaPihak = customer ? customer.nama : "Admin";

            if (isInvoiceMode) {
                selectedInvoiceKeys.forEach(invId => {
                    const amount = manualPayments[invId] || 0;
                    if (amount > 0) {
                        const inv = unpaidJual.find(i => i.id === invId);
                        const mutasiId = push(ref(db, 'mutasi')).key;
                        const newPaid = (inv.jumlahTerbayar || 0) + amount;
                        updates[`mutasi/${mutasiId}`] = {
                            id: mutasiId, idTransaksi: invId, nomorInvoice: inv.nomorInvoice,
                            nama: namaPihak, tanggal: values.tanggal.valueOf(), jumlah: amount,
                            tipe: 'pemasukan', metode: values.metode, kategori: 'penjualan_plate',
                            idPelanggan: values.idPelanggan, keterangan: values.keterangan || `Pembayaran Invoice ${inv.nomorInvoice}`,
                            buktiUrl, updatedAt: timestamp
                        };
                        updates[`transaksiJualPlate/${invId}/jumlahTerbayar`] = newPaid;
                        updates[`transaksiJualPlate/${invId}/statusPembayaran`] = newPaid >= inv.totalTagihan ? "Lunas" : "DP";
                        updates[`transaksiJualPlate/${invId}/riwayatPembayaran/${mutasiId}`] = {
                            tanggal: values.tanggal.valueOf(), jumlah: amount, mutasiId
                        };
                    }
                });
            } else {
                const mutasiId = push(ref(db, 'mutasi')).key;
                updates[`mutasi/${mutasiId}`] = {
                    id: mutasiId, nama: namaPihak, tanggal: values.tanggal.valueOf(),
                    jumlah: values.tipe === 'pengeluaran' ? -Math.abs(values.jumlah) : Math.abs(values.jumlah),
                    tipe: values.tipe, metode: values.metode, kategori: values.kategori,
                    keterangan: values.keterangan || "", buktiUrl, updatedAt: timestamp
                };
            }
            await update(ref(db), updates);
            message.success('Tersimpan!'); onCancel();
        } catch (err) { message.error(err.message); } finally { setIsSaving(false); }
    };

    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus Transaksi?', icon: <ExclamationCircleOutlined />,
            content: 'Saldo invoice akan dipulihkan otomatis ke sisa tagihan.',
            okText: 'Hapus', okType: 'danger',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const updates = {};
                    if (initialValues.idTransaksi) {
                        const invSnap = await get(ref(db, `transaksiJualPlate/${initialValues.idTransaksi}`));
                        if (invSnap.exists()) {
                            const d = invSnap.val();
                            const restored = Math.max(0, (d.jumlahTerbayar || 0) - Math.abs(initialValues.jumlah || 0));
                            updates[`transaksiJualPlate/${initialValues.idTransaksi}/jumlahTerbayar`] = restored;
                            updates[`transaksiJualPlate/${initialValues.idTransaksi}/statusPembayaran`] = restored <= 0 ? "Belum Bayar" : "DP";
                            updates[`transaksiJualPlate/${initialValues.idTransaksi}/riwayatPembayaran/${initialValues.id}`] = null;
                        }
                    }
                    updates[`mutasi/${initialValues.id}`] = null;
                    await update(ref(db), updates);
                    message.success('Dihapus!'); onCancel();
                } catch (e) { message.error('Gagal'); } finally { setIsSaving(false); }
            }
        });
    };

    return (
        <Modal
            open={open}
            title={<Title level={4} style={{ margin: 0 }}>{isEditMode ? '🔎 Detail Mutasi' : '➕ Buat Transaksi Baru'}</Title>}
            onCancel={onCancel} width={850} style={{ top: 20 }}
            footer={[
                contextHolder,
                isEditMode && <Button key="del" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving} style={{ float: 'left' }}>Hapus Transaksi</Button>,
                <Button key="back" onClick={onCancel}>Batal</Button>,
                !isEditMode && <Button key="submit" type="primary" size="large" loading={isSaving} icon={<CheckCircleOutlined />} onClick={() => form.submit()}>Simpan Pembayaran</Button>
            ]}
        >
            <Form form={form} layout="vertical" onFinish={onFinish} disabled={isEditMode}>
                {/* --- HEADER INFO --- */}
                <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item name="tanggal" label="Tgl Transaksi"><DatePicker style={{width:'100%'}} format="DD MMMM YYYY" suffixIcon={<CalendarOutlined />} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="metode" label="Metode Pembayaran"><Select placeholder="Pilih..."><Option value="Transfer"><BankOutlined /> Transfer Bank</Option><Option value="Tunai"><WalletOutlined /> Tunai / Cash</Option></Select></Form.Item></Col>
                        <Col span={8}>
                            <Form.Item name="tipe" label="Arus Kas">
                                <Radio.Group buttonStyle="solid" style={{width:'100%'}} onChange={() => {setSelectedInvoiceKeys([]); setManualPayments({});}}>
                                    <Radio.Button value="pemasukan" style={{width:'50%', textAlign:'center'}}>Masuk</Radio.Button>
                                    <Radio.Button value="pengeluaran" style={{width:'50%', textAlign:'center'}}>Keluar</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                        </Col>
                    </Row>
                </div>

                <Row gutter={16}>
                    <Col span={24}>
                        <Form.Item name="kategori" label="Kategori Transaksi" rules={[{required:true}]}>
                            <Select size="large" placeholder="Pilih kategori...">
                                {watchingTipe === 'pemasukan' 
                                    ? Object.entries({penjualan_plate: "Pembayaran Piutang (Faktur Plate)", pemasukan_lain: "Pemasukan Lain-lain"}).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)
                                    : Object.entries({gum: "Gum", developer: 'Developer', plate: "Plate", gaji_produksi: "Gaji Karyawan", operasional: "Operasional"}).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)
                                }
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                {isInvoiceMode && (
                    <Card size="small" style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: '12px', marginBottom: 20 }}>
                        {!isEditMode ? (
                            <>
                                <Row gutter={16} align="bottom">
                                    <Col span={12}>
                                        <Form.Item name="idPelanggan" label={<Text strong>1. Nama Pelanggan (Customer)</Text>} rules={[{required:true}]}>
                                            <Select size="large" showSearch placeholder="Cari nama customer..." loading={loadingCustomers} filterOption={(i, o) => (o?.children??'').toLowerCase().includes(i.toLowerCase())}>
                                                {customerOptions.map(c => <Option key={c.id} value={c.id}>{c.nama}</Option>)}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="jumlah" label={<Text strong>2. Total Uang Diterima</Text>}>
                                            <InputNumber 
                                                style={{width:'100%', border: '2px solid #1890ff', borderRadius: '8px'}} 
                                                size="large" prefix={<DollarOutlined />}
                                                formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} 
                                                parser={v => v.replace(/\$\s?|(\.*)/g, '')} 
                                                placeholder="Ketik total uang masuk..." 
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                {watchingPelanggan && (
                                    <div style={{ marginTop: 10 }}>
                                        <Alert 
                                            icon={<CalculatorOutlined />} showIcon 
                                            message={<div style={{display:'flex', justifyContent:'space-between', width:'100%'}}><Text strong>TOTAL PIUTANG SAAT INI:</Text><Text strong style={{fontSize: 18, color: '#cf1322'}}>{currencyFormatter(totalPiutang)}</Text></div>} 
                                            type="error" style={{ marginBottom: 15, borderRadius: '8px' }} 
                                        />
                                        
                                        <Text strong style={{fontSize: 15}}><UnorderedListOutlined /> Rincian Tagihan Invoice:</Text>
                                        <Table
                                            dataSource={availableInvoices}
                                            rowKey="id" size="middle" pagination={false}
                                            style={{ marginTop: 10 }}
                                            columns={[
                                                { 
                                                    title: 'Pilih', width: 60, align: 'center',
                                                    render: (_, r) => (
                                                        <Checkbox 
                                                            checked={selectedInvoiceKeys.includes(r.id)} 
                                                            style={{ transform: 'scale(1.3)' }}
                                                            onChange={(e) => handleCheckboxChange(r.id, e.target.checked, r.totalTagihan - r.jumlahTerbayar)} 
                                                        />
                                                    )
                                                },
                                                { 
                                                    title: 'Info Invoice', width: 220,
                                                    render: (_, r) => (
                                                        <div style={{ lineHeight: '1.4' }}>
                                                            <Text strong style={{color: '#003a8c'}}>{r.nomorInvoice}</Text><br/>
                                                            <Text type="secondary" style={{fontSize: 11}}><ClockCircleOutlined /> {dayjs(r.tanggal).format('DD MMM YYYY')}</Text>
                                                        </div>
                                                    )
                                                },
                                                { 
                                                    title: 'Finansial Faktur', 
                                                    render: (_, r) => (
                                                        <Row gutter={16} style={{ textAlign: 'right' }}>
                                                            <Col span={8}>
                                                                <Text type="secondary" style={{fontSize: 10}}>TOTAL</Text><br/>
                                                                <Text style={{fontSize: 12}}>{currencyFormatter(r.totalTagihan)}</Text>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Text type="secondary" style={{fontSize: 10}}>DIBAYAR</Text><br/>
                                                                <Text style={{fontSize: 12, color: '#52c41a'}}>{currencyFormatter(r.jumlahTerbayar)}</Text>
                                                            </Col>
                                                            <Col span={8}>
                                                                <Text type="secondary" style={{fontSize: 10}}>SISA</Text><br/>
                                                                <Text strong style={{fontSize: 12, color: '#f5222d'}}>{currencyFormatter(r.totalTagihan - r.jumlahTerbayar)}</Text>
                                                            </Col>
                                                        </Row>
                                                    )
                                                },
                                                { 
                                                    title: 'Bayar Sekarang', align:'right', width: 180,
                                                    render: (_, r) => (
                                                        <InputNumber
                                                            placeholder="0" value={manualPayments[r.id]} min={0} max={r.totalTagihan - r.jumlahTerbayar}
                                                            style={{ width: '100%', fontWeight: 'bold', border: manualPayments[r.id] > 0 ? '1px solid #52c41a' : '1px solid #d9d9d9' }}
                                                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                                            parser={v => v.replace(/\$\s?|(\.*)/g, '')}
                                                            onChange={(val) => handleManualAmountChange(r.id, val)}
                                                        />
                                                    )
                                                },
                                            ]}
                                        />
                                    </div>
                                )}
                            </>
                        ) : (
                            // MODE VIEW DETAIL
                            <Spin spinning={loadingViewedInvoice}>
                                {viewedInvoice ? (
                                    <div style={{ padding: '10px' }}>
                                        <Row justify="space-between" align="middle">
                                            <Col><Statistic title="Customer" value={viewedInvoice.namaPelanggan} valueStyle={{fontSize: 20, fontWeight: 'bold'}} /></Col>
                                            <Col style={{textAlign:'right'}}>
                                                <Tag color="blue" style={{padding:'5px 15px', fontSize: 14, borderRadius: '20px'}}>{viewedInvoice.nomorInvoice}</Tag><br/>
                                                <Text type="secondary"><CalendarOutlined /> {dayjs(viewedInvoice.tanggal).format('DD MMM YYYY')}</Text>
                                            </Col>
                                        </Row>
                                        <Divider style={{margin:'15px 0'}} />
                                        <Row gutter={16}>
                                            <Col span={8}><Statistic title="Total Tagihan" value={viewedInvoice.totalTagihan} formatter={v => currencyFormatter(v)} /></Col>
                                            <Col span={8}><Statistic title="Telah Terbayar" value={viewedInvoice.jumlahTerbayar} valueStyle={{color:'#3f8600'}} formatter={v => currencyFormatter(v)} /></Col>
                                            <Col span={8} style={{textAlign:'right'}}><Statistic title="Sisa Piutang" value={viewedInvoice.totalTagihan - viewedInvoice.jumlahTerbayar} valueStyle={{color:'#cf1322'}} formatter={v => currencyFormatter(v)} /></Col>
                                        </Row>
                                        <div style={{marginTop: 20, padding: '20px', background: '#e6f7ff', borderRadius: '12px', textAlign: 'center', border: '1px dashed #1890ff'}}>
                                            <Text type="secondary" style={{letterSpacing: 1}}>NOMINAL PADA TRANSAKSI INI</Text>
                                            <Title level={2} style={{margin: '10px 0 0 0', color: '#0050b3'}}>{currencyFormatter(Math.abs(initialValues.jumlah))}</Title>
                                        </div>
                                    </div>
                                ) : <Empty description="Data Invoice Tidak Ditemukan" /> }
                            </Spin>
                        )}
                    </Card>
                )}

                {!isInvoiceMode && (
                    <Form.Item name="jumlah" label="Nominal Transaksi (Rp)" rules={[{required:true, type:'number', min:1}]}>
                        <InputNumber 
                            style={{width:'100%', borderRadius: '8px'}} size="large" 
                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} 
                            parser={v => v.replace(/\$\s?|(\.*)/g, '')} 
                        />
                    </Form.Item>
                )}

                <Form.Item name="keterangan" label="Catatan / Keterangan Tambahan">
                    <Input.TextArea rows={3} placeholder="Tambahkan catatan jika diperlukan..." style={{borderRadius: '8px'}} />
                </Form.Item>

                <Form.Item label="Unggah Bukti Transaksi" name="bukti" valuePropName="fileList" getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList}>
                    <Upload listType="picture-card" maxCount={1} beforeUpload={() => false}>
                        {fileList.length < 1 && <div><UploadOutlined /><div style={{marginTop:8}}>Upload File</div></div>}
                    </Upload>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default TransaksiForm;

// Icons fallbacks
const UnorderedListOutlined = () => <span style={{marginRight: 8}}>📋</span>;