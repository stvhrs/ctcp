import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal, Form, Input, InputNumber, Button, message, Spin, Alert, Typography,
    Select, Space, Divider, Card, Row, Col, Statistic, DatePicker
} from 'antd';
import { 
    ref, push, serverTimestamp, get, child, update 
} from 'firebase/database';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// Pastikan path import ini sesuai dengan struktur project Anda
import { db } from '../../../api/firebase';
import { numberFormatter } from '../../../utils/formatters';

const { Text } = Typography;
const { Option } = Select;

// ==========================================
// LOGIC SERVICE: Update Firebase (Atomic)
// ==========================================
const updatePlateStock = async (items, overallRemark, selectedDate) => {
    try {
        const updates = {};
        const plateRef = ref(db, 'plate');

        // 1. Ambil data stok saat ini (Snapshot) untuk semua item
        const promises = items.map(item => get(child(plateRef, item.plateId)));
        const snapshots = await Promise.all(promises);

        // 2. Loop setiap item untuk menyusun object updates
        snapshots.forEach((snap, index) => {
            const item = items[index];
            
            if (!snap.exists()) {
                throw new Error(`Data plate dengan ID ${item.plateId} tidak ditemukan.`);
            }

            const currentData = snap.val();
            const currentStock = Number(currentData.stok || 0);
            const changeAmount = Number(item.quantity);
            const newStock = currentStock + changeAmount;

            // --- A. Siapkan Update untuk Node 'plate' ---
            updates[`/plate/${item.plateId}/stok`] = newStock;
            updates[`/plate/${item.plateId}/updatedAt`] = serverTimestamp();

            // --- B. Siapkan Data untuk Node 'historiStok' ---
            const newHistoryKey = push(child(ref(db), 'historiStok')).key;
            
            // Gabungkan keterangan
            let finalRemark = overallRemark;
            if (item.specificRemark) {
                finalRemark = overallRemark ? `${overallRemark} - ${item.specificRemark}` : item.specificRemark;
            }

            const historyData = {
                plateId: item.plateId,
                merek_plate: currentData.merek_plate || 'Unknown',
                ukuran_plate: currentData.ukuran_plate || 'Unknown',
                stokSebelum: currentStock,
                stokSesudah: newStock,
                perubahan: changeAmount,
                tanggal: selectedDate,     
                timestamp: serverTimestamp(),
                keterangan: finalRemark || '-'
            };

            updates[`/historiStok/${newHistoryKey}`] = historyData;
        });

        // 3. Eksekusi semua perubahan sekaligus
        await update(ref(db), updates);

        return true;
    } catch (error) {
        console.error("Error updating stock:", error);
        throw error;
    }
};

// ==========================================
// UI SUB-COMPONENT: Subtotal Display
// ==========================================
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

// ==========================================
// MAIN COMPONENT: BulkRestockModal
// ==========================================
const BulkRestockModal = ({ open, onClose, plateList }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [selectedPlateIdsInForm, setSelectedPlateIdsInForm] = useState(new Set());

    useEffect(() => {
        if (open) {
            form.resetFields();
            form.setFieldsValue({ 
                items: [{}],
                tanggal: dayjs() 
            });
            setSelectedPlateIdsInForm(new Set());
        }
    }, [open, form]);

    const handleFormValuesChange = useCallback((_, allValues) => {
        const currentIds = new Set(allValues.items?.map(item => item?.plateId).filter(Boolean) || []);
        setSelectedPlateIdsInForm(currentIds);
    }, []);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const overallRemark = values.overallRemark || '';
            const selectedDate = values.tanggal ? values.tanggal.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');

            const items = values.items || [];
            
            // Filter item yang valid saja
            const validItems = items.filter(
                item => item && item.plateId && item.quantity !== null && item.quantity !== undefined
            );

            if (validItems.length === 0) {
                message.warning("Mohon isi setidaknya satu item plate.");
                return;
            }
            if (validItems.some(item => Number(item.quantity) === 0)) {
                message.warning("Qty tidak boleh 0.");
                return;
            }

            setLoading(true);

            // Panggil fungsi logic di atas
            await updatePlateStock(validItems, overallRemark, selectedDate);

            message.success(`Stok berhasil diperbarui.`);
            onClose();
        } catch (error) {
            console.error('Error Restock:', error);
            message.error('Gagal menyimpan data: ' + error.message);
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
            width={1200}
        >
            <Spin spinning={loading} tip="Menyimpan perubahan stok...">
                <Alert
                    message="Tambahkan plate satu per satu. Pastikan tanggal dan jumlah stok benar."
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
                    <Row gutter={16}>
                        <Col xs={24} md={6}>
                            <Form.Item 
                                name="tanggal" 
                                label="Tanggal Transaksi"
                                rules={[{ required: true, message: 'Pilih tanggal' }]}
                            >
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={18}>
                            <Form.Item name="overallRemark" label="Keterangan Umum (Opsional)">
                                <Input placeholder="Contoh: Stok opname bulanan Q4 2025" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Typography.Title level={5} style={{ marginTop: 8, marginBottom: 8 }}>
                        Daftar Item Plate
                    </Typography.Title>

                    <Form.List name="items">
                        {(fields, { add, remove }, { errors }) => (
                            <>
                                <div
                                    style={{
                                        maxHeight: '55vh', 
                                        overflowY: 'auto',
                                        marginBottom: 16,
                                        border: '1px solid #d9d9d9',
                                        borderRadius: 4,
                                        padding: 12,
                                        backgroundColor: '#fafafa'
                                    }}
                                >
                                    {fields.map(({ key, name, ...restField }, index) => (
                                        <Card
                                            key={key}
                                            size="small"
                                            style={{
                                                marginBottom: 12,
                                                backgroundColor: '#fff',
                                                border: '1px solid #e8e8e8'
                                            }}
                                            bodyStyle={{ padding: '12px' }}
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
                                                <Col xs={24} md={10} lg={9}>
                                                    <Form.Item
                                                        {...restField}
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
                                                            disabled={!plateList || plateList.length === 0}
                                                        >
                                                            {plateList?.map(plate => (
                                                                <Option
                                                                    key={plate.id}
                                                                    value={plate.id}
                                                                    disabled={
                                                                        selectedPlateIdsInForm.has(plate.id) &&
                                                                        form.getFieldValue(['items', name, 'plateId']) !== plate.id
                                                                    }
                                                                >
                                                                    {`${plate.merek_plate} ${plate.ukuran_plate}`} (Stok: {numberFormatter(plate.stok)})
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

                                                <Col xs={24} md={6} lg={9}>
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
                                .filter(it => it && it.plateId && it.quantity !== null && it.quantity !== undefined)
                                .forEach(it => {
                                    totalQtyChange += Number(it.quantity || 0);
                                });
                            return (
                                <>
                                    <Divider style={{ margin: '12px 0' }} />
                                    <Row justify="end">
                                        <Col xs={12} sm={8} md={6}>
                                            <Statistic
                                                title="Total Perubahan Qty"
                                                value={totalQtyChange}
                                                formatter={numberFormatter}
                                                valueStyle={{ fontSize: 18 }}
                                            />
                                        </Col>
                                    </Row>
                                </>
                            );
                        }}
                    </Form.Item>

                    <Row justify="end" style={{ marginTop: 16 }}>
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