import React, { useState, useEffect } from 'react';
// Impor Typography ditambahkan kembali
import { Modal, Form, Input, InputNumber, Row, Col, message, Typography } from 'antd'; 
import { ref, push, set, serverTimestamp } from 'firebase/database'; 
import { db } from '../../../api/firebase'; // Sesuaikan path

const { Text } = Typography;

const BukuForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const isEditing = !!initialValues;

    useEffect(() => {
        if (open) { 
            if (isEditing) {
                form.setFieldsValue(initialValues);
            } else {
                form.resetFields();
                // Set nilai default 0 untuk field numerik (stok & harga)
                form.setFieldsValue({ hrgBeli: 0, hrgJual: 0, stok: 0 }); 
            }
        }
    }, [initialValues, isEditing, form, open]); 

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            // Objek data baru dengan konversi angka
            const data = {
                noKodePlate: values.noKodePlate || "",
                judulPlate: values.judulPlate || "",
                ukuran: values.ukuran || "",
                stok: Number(values.stok) || 0, // Diubah ke Number
                hrgBeli: Number(values.hrgBeli) || 0,
                hrgJual: Number(values.hrgJual) || 0,
                merek: values.merek || "",
                updatedAt: serverTimestamp(), 
            };

            if (isEditing) {
                const plateRef = ref(db, `plate/${initialValues.id}`);
                await set(plateRef, {
                    ...initialValues,
                    ...data 
                });
                message.success("Plat berhasil diperbarui.");
            } else {
                const plateListRef = ref(db, 'plate');
                const newBukuRef = push(plateListRef); 
                
                data.createdAt = serverTimestamp(); 

                // === LOGIKA HISTORI STOK DITAMBAHKAN KEMBALI ===
                // Hanya untuk data baru
                const historyRef = push(ref(db, `plate/${newBukuRef.key}/historiStok`));
                data.historiStok = {
                    [historyRef.key]: {
                        keterangan: "Stok Awal (Manual)",
                        perubahan: data.stok,
                        stokSebelum: 0,
                        stokSesudah: data.stok,
                        timestamp: serverTimestamp()
                    }
                };
                // ===============================================
                
                await set(newBukuRef, data); 
                message.success("Plat baru berhasil ditambahkan.");
            }
            onCancel();
        } catch (error) {
            console.error("Form submit error:", error);
            message.error("Gagal menyimpan data: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper JSX untuk input harga (currency formatter)
    const priceInput = (
         <InputNumber 
           style={{ width: '100%' }} 
           min={0} 
           formatter={value => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
           parser={value => value.replace(/Rp\s?|(,*)/g, '')} 
         />
    );

    return (
        <Modal
            title={isEditing ? "Edit Plat" : "Tambah Plat Baru"}
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={loading} 
            width={"70vw"}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Row gutter={16}>
                    <Col sm={12} xs={24}>
                        <Form.Item 
                            name="noKodePlate" 
                            label="NoKode Plate" 
                            rules={[{ required: true, message: 'NoKode Plate harus diisi' }]}
                        >
                            <Input placeholder="Masukkan NoKode Plate" />
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item 
                            name="judulPlate" 
                            label="Judul Plate" 
                            rules={[{ required: true, message: 'Judul Plate harus diisi' }]}
                        >
                            <Input placeholder="Masukkan Judul Plate" />
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item name="ukuran" label="Ukuran">
                            <Input placeholder="Masukkan Ukuran" />
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        {/* Stok diubah kembali ke InputNumber */}
                        <Form.Item 
                            name="stok" 
                            label="Stok Awal"
                            rules={[{ required: true, message: 'Stok Awal harus diisi' }]}
                        >
                            <InputNumber 
                                style={{ width: '100%' }} 
                                placeholder="Masukkan Stok Awal"
                                min={0}
                                // Stok Awal hanya bisa diisi saat tambah baru
                                readOnly={isEditing} 
                            />
                        </Form.Item>
                        {isEditing && (
                            <Text type="secondary" style={{fontSize: 12, marginTop: -12, display: 'block'}}>
                                Stok hanya bisa diubah melalui menu 'Update Stok'.
                            </Text>
                        )}
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item name="hrgBeli" label="Hrg. Beli">
                            {priceInput}
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item name="hrgJual" label="Hrg. Jual">
                            {priceInput}
                        </Form.Item>
                    </Col>
                    <Col sm={12} xs={24}>
                        <Form.Item name="merek" label="Merek">
                            <Input placeholder="Masukkan Merek" />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

export default BukuForm;