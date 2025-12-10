// ================================
// FILE: src/pages/plate/components/BukuForm.jsx
// - UPDATE: Stok dikunci (disabled) saat mode Edit agar history tidak rusak.
// ================================

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Form,
    Input,
    InputNumber,
    Row,
    Col,
    Grid,
    message,
    Typography,
    Button,
    Space,
    Popconfirm,
} from 'antd';
import { ref, update, push, serverTimestamp, remove, set } from 'firebase/database';
import { db } from '../../../api/firebase';

const BukuForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    
    // Cek apakah sedang mode edit
    const isEditing = !!initialValues;
    
    const screens = Grid.useBreakpoint();

    useEffect(() => {
        if (open) {
            if (isEditing) {
                form.setFieldsValue(initialValues);
            } else {
                form.resetFields();
                form.setFieldsValue({
                    stok: 0,
                    harga_plate: 0,
                });
            }
        }
    }, [initialValues, isEditing, form, open]);

    const handleSubmit = async (values) => {
        setLoading(true);

        const identitasItem = `${values.ukuran_plate} (${values.merek_plate})`;

        if (isEditing) {
            message.loading({ content: 'Memperbarui plate...', key: 'update' });
            try {
                const bookRef = ref(db, `plate/${initialValues.id}`);
                
                // KITA HANYA UPDATE DATA MASTER (Tanpa Stok)
                // Stok dibiarkan apa adanya dari database (security measure)
                const updateData = {
                    merek_plate: values.merek_plate,
                    ukuran_plate: values.ukuran_plate,
                    harga_plate: values.harga_plate,
                    updatedAt: serverTimestamp(),
                    // Stok tidak di-include di updateData agar aman, 
                    // tapi kalaupun terkirim, UI sudah memblokirnya.
                };

                await update(bookRef, updateData);

                message.success({ content: `Plate "${identitasItem}" berhasil diperbarui.`, key: 'update' });
                handleCloseModal();
            } catch (error) {
                console.error('Gagal memperbarui plate:', error);
                message.error({ content: 'Gagal memperbarui plate: ' + error.message, key: 'update' });
            }
        } else {
            // ... (Kode Simpan Baru tetap sama) ...
            message.loading({ content: 'Menyimpan plate baru...', key: 'create' });
            try {
                const newBookRef = push(ref(db, 'plate'));
                const newBookId = newBookRef.key;
                const now = serverTimestamp();

                const newData = {
                    ...values,
                    id: newBookId,
                    createdAt: now,
                    updatedAt: now,
                };

                await set(newBookRef, newData);

                message.success({ content: `Plate "${identitasItem}" berhasil dibuat.`, key: 'create' });
                handleCloseModal();
            } catch (error) {
                console.error('Gagal menyimpan plate baru:', error);
                message.error({ content: 'Gagal menyimpan plate: ' + error.message, key: 'create' });
            }
        }

        setLoading(false);
    };

    const handleDelete = async () => {
        if (!initialValues?.id) return;
        setDeleting(true);
        try {
            await remove(ref(db, `plate/${initialValues.id}`));
            message.success(`Plate "${initialValues.ukuran_plate}" berhasil dihapus.`);
            handleCloseModal();
        } catch (error) {
            console.error('Delete error:', error);
            message.error('Gagal menghapus plate: ' + error.message);
        } finally {
            setDeleting(false);
        }
    };

    const handleCloseModal = () => {
        form.resetFields();
        setLoading(false);
        setDeleting(false);
        onCancel();
    };

    const priceInput = (
        <InputNumber
            style={{ width: '100%' }}
            min={0}
            formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value.replace(/Rp\s?|(,*)/g, '')}
            placeholder="Input harga beli..."
        />
    );

    return (
        <Modal
            title={isEditing ? 'Edit Plate' : 'Tambah Plate Baru'}
            open={open}
            onCancel={handleCloseModal}
            width={screens.md ? 700 : '95vw'}
            destroyOnClose
            footer={null}
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Row gutter={16}>
                    <Col sm={12} xs={24}>
                        <Form.Item
                            name="merek_plate"
                            label="Merek Plate"
                            rules={[{ required: true, message: 'Merek Plate harus diisi' }]}
                        >
                            <Input placeholder="Contoh: Fuji" />
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item
                            name="ukuran_plate"
                            label="Ukuran Plate"
                            rules={[{ required: true, message: 'Ukuran Plate harus diisi' }]}
                        >
                            <Input placeholder="Contoh: 103 x 79" />
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item
                            name="harga_plate"
                            label="Harga Beli Plate" 
                            rules={[{ required: true, message: 'Harga Beli harus diisi' }]}
                        >
                            {priceInput}
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item
                            name="stok"
                            label={isEditing ? "Stok (Gunakan menu Update Stok)" : "Stok Awal"}
                            rules={[{ required: !isEditing, message: 'Stok harus diisi' }]}
                        >
                            {/* MODIFIKASI: Input Number diberi properti disabled={isEditing} */}
                            <InputNumber 
                                style={{ width: '100%', color: isEditing ? '#000' : undefined }} 
                                placeholder="Stok saat ini" 
                                min={0}
                                disabled={isEditing} 
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row justify="space-between" style={{ marginTop: 24 }}>
                    <Col>
                        {isEditing && (
                            <Popconfirm
                                title="Yakin ingin menghapus plate ini?"
                                description={`Plate "${initialValues?.ukuran_plate || 'ini'}" akan dihapus permanen.`}
                                onConfirm={handleDelete}
                                okText="Ya, Hapus"
                                cancelText="Batal"
                                okButtonProps={{ loading: deleting }}
                                disabled={deleting}
                            >
                                <Button danger>Hapus Plate</Button>
                            </Popconfirm>
                        )}
                    </Col>
                    <Col>
                        <Space>
                            <Button onClick={handleCloseModal} disabled={loading || deleting}>
                                Batal
                            </Button>
                            <Button
                                type="primary"
                                loading={loading}
                                onClick={() => form.submit()}
                                disabled={loading || deleting}
                            >
                                {isEditing ? 'Perbarui' : 'Simpan'}
                            </Button>
                        </Space>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

export default BukuForm;