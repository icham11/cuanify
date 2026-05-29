"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Trash2, Edit2, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { DynamicOrderTemplate } from "@/lib/bookings/whatsapp-parser";

interface TemplateField {
  key: string;
  label: string;
  aliases: string[];
  isRequired: boolean;
  displayOrder: number;
}

interface Template {
  id?: number;
  name: string;
  typeKey: string;
  isActive: boolean;
  fields: TemplateField[];
}

export function OrderTemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [formData, setFormData] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/bakery/order-templates");
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) {}
      
      if (!res.ok) {
        throw new Error(data?.error || `Failed to fetch templates: ${res.status}`);
      }
      setTemplates(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: Template) => {
    setEditingId(template.id!);
    setFormData(JSON.parse(JSON.stringify(template)));
  };

  const handleNew = () => {
    setEditingId('new');
    setFormData({
      name: "",
      typeKey: "",
      isActive: true,
      fields: []
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(null);
  };

  const handleSave = async () => {
    if (!formData?.name || !formData?.typeKey) {
      toast.error("Nama dan Tipe Key wajib diisi");
      return;
    }

    try {
      const isNew = editingId === 'new';
      const url = isNew ? "/api/bakery/order-templates" : `/api/bakery/order-templates/${editingId}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal menyimpan template");
      }

      toast.success("Template berhasil disimpan");
      handleCancel();
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus template ini?")) return;

    try {
      const res = await fetch(`/api/bakery/order-templates/${id}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Gagal menghapus template");

      toast.success("Template berhasil dihapus");
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const addField = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      fields: [
        ...formData.fields,
        {
          key: "",
          label: "",
          aliases: [],
          isRequired: false,
          displayOrder: formData.fields.length
        }
      ]
    });
  };

  const updateField = (index: number, updates: Partial<TemplateField>) => {
    if (!formData) return;
    const newFields = [...formData.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFormData({ ...formData, fields: newFields });
  };

  const removeField = (index: number) => {
    if (!formData) return;
    const newFields = formData.fields.filter((_, i) => i !== index);
    setFormData({ ...formData, fields: newFields });
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  if (editingId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{editingId === 'new' ? 'Buat Template Baru' : 'Edit Template'}</CardTitle>
          <CardDescription>
            Tentukan format form dinamis yang akan digunakan parser AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nama Template</label>
              <Input 
                placeholder="Misal: Tumpeng Nasi Kuning" 
                value={formData?.name} 
                onChange={e => setFormData(s => s ? {...s, name: e.target.value} : null)} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type Key (Unik)</label>
              <Input 
                placeholder="Misal: tumpeng" 
                value={formData?.typeKey} 
                onChange={e => setFormData(s => s ? {...s, typeKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')} : null)} 
                disabled={editingId !== 'new'}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              checked={formData?.isActive} 
              onChange={e => { const val = e.target.checked; setFormData(s => s ? {...s, isActive: val} : null) }} 
            />
            <label className="text-sm font-medium cursor-pointer" onClick={() => setFormData(s => s ? {...s, isActive: !s.isActive} : null)}>Aktif</label>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Fields Detail</h3>
              <Button onClick={addField} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Field
              </Button>
            </div>
            
            {formData?.fields.map((field, i) => (
              <div key={i} className="flex items-start space-x-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Key (Variabel)</label>
                    <Input 
                      placeholder="Misal: ukuranTumpeng" 
                      value={field.key} 
                      onChange={e => updateField(i, { key: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Label Tampilan</label>
                    <Input 
                      placeholder="Misal: Ukuran Tumpeng" 
                      value={field.label} 
                      onChange={e => updateField(i, { label: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm font-medium">Aliases (Koma terpisah)</label>
                    <Input 
                      placeholder="Misal: ukuran tumpeng, besar tumpeng, porsi" 
                      value={field.aliases.join(", ")} 
                      onChange={e => updateField(i, { aliases: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} 
                    />
                    <p className="text-xs text-slate-500">Kata kunci ini akan dikenali oleh parser AI saat membaca WA customer.</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeField(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {formData?.fields.length === 0 && (
              <div className="text-center p-8 text-slate-500 border border-dashed rounded-lg">
                Belum ada field tambahan. Field nama, telepon, tanggal, dan jam sudah otomatis ditangani oleh sistem.
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={handleCancel}>Batal</Button>
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-slate-500">Kelola format pemesanan dinamis untuk parser WhatsApp otomatis.</p>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          Template Baru
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <Card key={t.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex justify-between items-center text-lg">
                <span>{t.name}</span>
                {!t.isActive && <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full">Draft</span>}
              </CardTitle>
              <CardDescription>Key: {t.typeKey}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500 mb-4">
                {t.fields.length} dynamic fields defined.
              </p>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(t)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(t.id!)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <div className="col-span-full text-center p-12 border border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50">
            <h3 className="text-lg font-medium">Belum ada template</h3>
            <p className="text-slate-500 mt-2">Buat template pesanan kustom agar parser AI mengenali produk baru Anda.</p>
            <Button className="mt-4" onClick={handleNew}>
              Buat Template Pertama
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
