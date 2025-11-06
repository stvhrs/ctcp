import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal, Form, Input, InputNumber, Button, message, Spin, Alert, Typography, Select, Space, Divider, Card, Row, Col, Statistic
} from 'antd';
import { ref, push, serverTimestamp, runTransaction, set } from 'firebase/database';
import { db } from '../../../api/firebase';
import { numberFormatter } from '../../../utils/formatters';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const SubtotalDisplay = ({ index }) => (
    <Form.Item
        noStyle
        shouldUpdate={(prev, cur) => prev.items?.[index]?.quantity !== cur.items?.[index]?.quantity}
    >
        {({ getFieldValue }) => {
            const quantity = Number(getFieldValue(['items', index, 'quantity']) || 0);
            const color = quantity > 0 ? '#52c41a' : quantity < 0 ? '#f5222d' : '#8c8c8c';
            const prefix = quantity > 0 ? '+' : '';
            return (
                <Input
                    readOnly
                    disabled
                    value={`${prefix}${numberFormatter(quantity)}`}
                    style={{
                        width: '100%',
                        textAlign: 'right',
                        background: '#f0f2f5',
                        color,
                        fontWeight: 'bold'
                    }}
                />
            );
        }}
    </Form.Item>
);

// --- MODIFIKASI: Prop diubah ke plateList ---
const BulkRestockModal = ({ open, onClose, plateList }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    // --- MODIFIKASI: State diubah ke plateId ---
    const [selectedPlateIdsInForm, setSelectedPlateIdsInForm] = useState(new Set());

    useEffect(() => {
        if (open) {
            form.resetFields();
            form.setFieldsValue({ items: [{}] });
            // --- MODIFIKASI: State diubah ke plateId ---
            setSelectedPlateIdsInForm(new Set());
        }
    }, [open, form]);

    const handleFormValuesChange = useCallback((_, allValues) => {
        // --- MODIFIKASI: Menggunakan 'plateId' ---
        const currentIds = new Set(allValues.items?.map(item => item?.plateId).filter(Boolean) || []);
        setSelectedPlateIdsInForm(currentIds);
    }, []);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const overallRemark = values.overallRemark || '';
            const items = values.items || [];
            const validItems = items.filter(
                // --- MODIFIKASI: Menggunakan 'plateId' ---
                item => item && item.plateId && item.quantity !== null && item.quantity !== undefined
            );

            if (validItems.length === 0) {
                message.warning('Tambahkan setidaknya satu item plate yang valid.');
                return;
            }
            const hasZeroQuantity = validItems.some(item => Number(item.quantity) === 0);
            if (hasZeroQuantity) {
                message.error('Jumlah perubahan tidak boleh 0. Hapus baris atau isi jumlah yang valid.');
                return;
            }

            // --- MODIFIKASI: Menggunakan 'plateId' ---
            const platesToUpdate = validItems.map(item => ({
                plateId: item.plateId,
                quantity: Number(item.quantity),
                specificRemark: item.specificRemark || ''
            }));

            if (platesToUpdate.length === 0) {
                message.info('Tidak ada perubahan stok yang valid untuk disimpan.');
                return;
            }

            setLoading(true);

            // --- MODIFIKASI: Menggunakan 'plateId' ---
            const updatePromises = platesToUpdate.map(async ({ plateId, quantity, specificRemark }) => {
                const jumlahNum = quantity;
                const plateRef = ref(db, `plate/${plateId}`); // <-- Path ke data plate

                let keteranganGabungan = overallRemark;
                if (specificRemark) {
                    keteranganGabungan = overallRemark
                        ? `${overallRemark} (${specificRemark})`
                        : specificRemark;
                }
                if (!keteranganGabungan) {
                    keteranganGabungan =
                        jumlahNum > 0 ? 'Stok Masuk (Borongan)' : 'Stok Keluar (Borongan)';
                }

                let historyDataForRoot = null;

                // --- MODIFIKASI: Transaksi pada plateRef ---
                await runTransaction(plateRef, currentData => {
                    if (!currentData) {
                        console.warn(`Plate dengan ID ${plateId} tidak ditemukan. Transaksi dibatalkan.`);
                        return; // Membatalkan transaksi untuk item ini
                    }

                    const stokSebelum = Number(currentData.stok) || 0;
                    const stokSesudah = stokSebelum + jumlahNum;

                    // --- MODIFIKASI: Skema histori disesuaikan untuk 'plate' ---
                    historyDataForRoot = {
                        plateId: plateId, // <-- Menggunakan plateId
                        ukuran_plate: `${currentData.ukuran_plate} (${currentData.merek_plate})`, // <-- Judul gabungan
                        kode_plate: currentData.kode_plate || 'N/A',
                        merek_plate: currentData.merek_plate || 'N/A', // <-- Menggunakan merek_plate
                        perubahan: jumlahNum,
                        stokSebelum,
                        stokSesudah,
                        keterangan: keteranganGabungan,
                        timestamp: serverTimestamp()
                    };

                    // --- MODIFIKASI: Data plate yang diupdate (tanpa 'historiStok' child) ---
                    return {
                        ...currentData,
                        stok: stokSesudah,
                        updatedAt: serverTimestamp(),
                    };
                });

                if (historyDataForRoot) {
                    // Simpan ke log riwayat utama
                    const newHistoryRef = push(ref(db, 'historiStok'));
                    await set(newHistoryRef, historyDataForRoot);
                } else {
                    // Ini terjadi jika transaksi dibatalkan (currentData null)
                    throw new Error(`Gagal memproses plate ID ${plateId} (mungkin tidak ditemukan).`);
                }
            });

            await Promise.all(updatePromises);

            message.success(`Stok untuk ${platesToUpdate.length} plate berhasil diperbarui.`);
            onClose();
        } catch (error) {
            console.error('Kesalahan Restock Borongan:', error);
            if (error.code && error.message) {
                message.error(`Gagal update stok: ${error.message} (Kode: ${error.code})`);
            } else if (error.errorFields) {
                message.error(
                    'Periksa kembali input form. Pastikan semua plate dan jumlah terisi dengan benar.'
                );
            } else if (error.message) {
                message.error(`Gagal: ${error.message}`);
            } else {
                message.error('Terjadi kesalahan saat menyimpan data.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="Restock Plate Borongan"
            open={open}
            onCancel={onClose}
            footer={null}
            destroyOnClose
            width={1000}
        >
            <Spin spinning={loading} tip="Menyimpan perubahan stok...">
                <Alert
                    message="Tambahkan plate satu per satu ke dalam daftar di bawah. Isi jumlah penambahan (+) atau pengurangan (-). Keterangan Umum akan ditambahkan ke setiap riwayat stok plate."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
                <Form
                    form={form}
                    layout="vertical"
                    autoComplete="off"
                    onValuesChange={handleFormValuesChange}
                    initialValues={{ items: [{}] }}
                >
                    <Form.Item name="overallRemark" label="Keterangan Umum (Opsional)">
                        <Input.TextArea rows={2} placeholder="Contoh: Stok opname bulanan Q4 2025" />
                    </Form.Item>

                    <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>
                        Item Plate
                    </Typography.Title>

                    <Form.List name="items">
                        {(fields, { add, remove }, { errors }) => (
                            <>
                                <div
                                    style={{
                                        maxHeight: '50vh',
                                        overflowY: 'auto',
                                        marginBottom: 16,
                                        border: '1px solid #d9d9d9',
                                        borderRadius: 2,
                                        padding: 8
                                    }}
                                >
                                    {fields.map(({ key, name, ...restField }, index) => (
                                        <Card
                                            key={key}
                                            size="small"
                                            style={{
                                                marginBottom: 16,
                                                backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9'
                                            }}
                                            extra={
                                                fields.length > 0 ? (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => remove(name)}
                                                    />
                                                ) : null
                                            }
                                        >
                                            <Row gutter={[16, 0]}>
                                                <Col xs={24} md={10} lg={8}>
                                                    <Form.Item
                                                        {...restField}
                                                        // --- MODIFIKASI: field diubah ke 'plateId' ---
                                                        name={[name, 'plateId']}
                                                        label={`Item #${index + 1}: Plate`}
                                                        rules={[{ required: true, message: 'Pilih plate' }]}
                                                        style={{ marginBottom: 8 }}
                                                    >
                                                        <Select
                                                            showSearch
                                                            placeholder="Cari & Pilih Plate..."
                                                            optionFilterProp="children"
                                                            filterOption={(input, option) =>
                                                                (option?.children?.toString() ?? '')
                                                                    .toLowerCase()
                                                                    .includes(input.toLowerCase())
                                                            }
                                                            filterSort={(a, b) =>
                                                                (a?.children?.toString() ?? '')
                                                                    .toLowerCase()
                                                                    .localeCompare((b?.children?.toString() ?? '').toLowerCase())
                                                            }
                                                            // --- MODIFIKASI: Cek 'plateList' ---
                                                            disabled={!plateList || plateList.length === 0}
                                                            notFoundContent={
                                                                !plateList || plateList.length === 0 ? (
                                                                    <Spin size="small" />
                                                                ) : (
                                                                    'Plate tidak ditemukan'
                                                                )
                                                            }
                                                        >
                                                            {/* --- MODIFIKASI: Loop 'plateList' --- */}
                                                            {plateList?.map(plate => (
                                                                <Option
                                                                    key={plate.id}
                                                                    value={plate.id}
                                                                    disabled={
                                                                        // --- MODIFIKASI: Cek state 'plateId' ---
                                                                        selectedPlateIdsInForm.has(plate.id) &&
                                                                        form.getFieldValue(['items', name, 'plateId']) !== plate.id
                                                                    }
                                                                >
                                                                    {/* --- MODIFIKASI: Tampilan Opsi Dropdown --- */}
                                                                    {`${plate.ukuran_plate} (${plate.merek_plate})`} (Stok: {numberFormatter(plate.stok)})
                                                                </Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>

                                                <Col xs={12} md={4} lg={3}>
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'quantity']}
                                                        label="Qty (+/-)"
                                                        rules={[
                                                            { required: true, message: 'Isi Qty' },
                                                            { type: 'number', message: 'Harus angka' }
                                                        ]}
                                                        style={{ marginBottom: 8 }}
                                                    >
                                                        <InputNumber placeholder="+/-" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>

                                                <Col xs={12} md={4} lg={3}>
                                                    <Form.Item label="Perubahan" style={{ marginBottom: 8 }}>
                                                        <SubtotalDisplay index={index} />
                                                    </Form.Item>
                                                </Col>

                                                <Col xs={24} md={6} lg={10}>
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'specificRemark']}
                                                        label="Ket. Spesifik"
                                                        style={{ marginBottom: 8 }}
                                                    >
                                                        <Input placeholder="Opsional" />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        </Card>
                                    ))}
                                </div>

                                <Form.Item>
                                    <Button
                                        type="dashed"
                                        onClick={() => add()}
                                        block
                                        icon={<PlusOutlined />}
                                        // --- MODIFIKASI: Cek 'plateList' ---
                                        disabled={!plateList || plateList.length === 0}
                                    >
                                        Tambah Item Plate
                                    </Button>
                                    <Form.ErrorList errors={errors} />
                                </Form.Item>
                            </>
                        )}
                    </Form.List>

                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                            JSON.stringify(prev.items || []) !== JSON.stringify(cur.items || [])
                        }
                    >
                        {({ getFieldValue }) => {
                            const items = getFieldValue('items') || [];
                            let totalQtyChange = 0;
                            items
                                // --- MODIFIKASI: Cek 'plateId' ---
                                .filter(it => it && it.plateId && it.quantity !== null && it.quantity !== undefined)
                                .forEach(it => {
                                    totalQtyChange += Number(it.quantity || 0);
                                });
                            return (
                                <>
                                    <Divider />
                                    <Row justify="end">
                                        <Col xs={12} sm={8} md={6}>
                                            <Statistic
                                                title="Total Perubahan Qty"
                                                value={totalQtyChange}
                                                formatter={numberFormatter}
                                            />
                                        </Col>
                                    </Row>
                                    <Divider />
                                </>
                            );
                        }}
                    </Form.Item>

                    <Row justify="end" style={{ marginTop: 24 }}>
                        <Col>
                            <Space>
                                <Button onClick={onClose} disabled={loading}>
                                    Batal
                                </Button>
                                <Button type="primary" onClick={handleOk} loading={loading} size="large">
                                    Simpan Perubahan Stok
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </Form>
            </Spin>
        </Modal>
    );
};

export default BulkRestockModal;