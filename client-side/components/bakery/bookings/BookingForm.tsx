"use client";

import { useMemo, useState } from "react";
import { SubmitHandler, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import { formatCurrency } from "@/components/orders/formatters";
import { useOrders } from "@/components/bakery/store";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";

const slotLimitPerHour = 3;
const blockedDates = ["2026-03-31", "2026-04-18"];
const deliverySlots = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

const productCatalog = [
  {
    category: "Cake",
    subcategories: [
      {
        name: "Birthday Cake",
        products: ["Buttercream Classic", "Red Velvet Special", "Chocolate Ganache"],
      },
      {
        name: "Wedding Cake",
        products: ["Tiered Floral", "Minimal White Tier", "Gold Accent Tier"],
      },
    ],
  },
  {
    category: "Pastry",
    subcategories: [
      {
        name: "Dessert Box",
        products: ["Brownies Box", "Mix Dessert Box", "Cheesecake Box"],
      },
      {
        name: "Savory",
        products: ["Mini Quiche", "Chicken Puff", "Croissant Bundle"],
      },
    ],
  },
];

const sizePriceMap: Record<string, number> = {
  "Mini": 120000,
  "6 inch": 220000,
  "8 inch": 340000,
  "10 inch": 520000,
  "Tier 2": 1150000,
};

const addOnCatalog: Record<string, Array<{ id: string; label: string; price: number }>> = {
  Cake: [
    { id: "flowers", label: "Fresh flowers", price: 50000 },
    { id: "topper", label: "Custom topper", price: 45000 },
    { id: "photo", label: "Edible photo print", price: 35000 },
  ],
  Pastry: [
    { id: "pack", label: "Premium packaging", price: 30000 },
    { id: "ribbon", label: "Gift ribbon", price: 15000 },
    { id: "card", label: "Greeting card", price: 10000 },
  ],
};

const deliveryFees: Record<string, number> = {
  "Central City": 20000,
  "North District": 30000,
  "South District": 25000,
  "West District": 28000,
  "Outside Area": 45000,
};

const itemSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().min(1, "Subcategory is required"),
  productName: z.string().min(1, "Product is required"),
  size: z.string().min(1, "Size is required"),
  quantity: z.number().int().min(1, "Minimum quantity is 1"),
  addOns: z.array(z.string()),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const addressSchema = z.object({
  label: z.string().min(1, "Address label is required"),
  area: z.string().min(1, "Delivery area is required"),
  addressLine: z.string().min(5, "Address is too short"),
});

const bookingSchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  phoneNumber: z.string().min(8, "Phone number is required"),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliverySlot: z.string().min(1, "Delivery slot is required"),
  customNotes: z.string().max(400).optional().or(z.literal("")),
  paymentStatus: z.enum(["Pending", "DP Paid", "Paid"]),
  manualAdjustment: z.number().default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  deliveryAddresses: z.array(addressSchema).min(1, "At least one address is required"),
});

type BookingFormInput = z.input<typeof bookingSchema>;
type BookingFormValues = z.output<typeof bookingSchema>;

function getCategoryAddOns(category: string) {
  return addOnCatalog[category] ?? [];
}

function parseEmailDraft(text: string): Partial<BookingFormValues> {
  const read = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? "";
  const customerName = read(/name\s*[:\-]\s*(.+)/i);
  const phone = read(/phone\s*[:\-]\s*([+\d\s-]+)/i);
  const deliveryDate = read(/date\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i);
  const slot = read(/slot\s*[:\-]\s*(\d{2}:\d{2})/i);
  const notes = read(/notes?\s*[:\-]\s*(.+)/i);
  const productHint = read(/product\s*[:\-]\s*(.+)/i).toLowerCase();

  let category = "Cake";
  if (productHint.includes("pastry") || productHint.includes("box")) {
    category = "Pastry";
  }

  const categoryData = productCatalog.find((item) => item.category === category) ?? productCatalog[0];
  const subcategory = categoryData.subcategories[0];

  return {
    customerName,
    phoneNumber: phone,
    deliveryDate,
    deliverySlot: slot || "09:00",
    customNotes: notes,
    items: [
      {
        category,
        subcategory: subcategory.name,
        productName: subcategory.products[0],
        size: "8 inch",
        quantity: 1,
        addOns: [],
        notes: "",
      },
    ],
    deliveryAddresses: [
      {
        label: "Primary",
        area: "Central City",
        addressLine: "Please review imported address",
      },
    ],
  };
}

export default function BookingForm() {
  const { addOrder, orders } = useOrders();
  const [quickPaste, setQuickPaste] = useState("");
  const [draftImported, setDraftImported] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      deliveryDate: "",
      deliverySlot: "",
      customNotes: "",
      paymentStatus: "Pending",
      manualAdjustment: 0,
      items: [
        {
          category: "Cake",
          subcategory: "Birthday Cake",
          productName: "Buttercream Classic",
          size: "8 inch",
          quantity: 1,
          addOns: [],
          notes: "",
        },
      ],
      deliveryAddresses: [
        {
          label: "Primary",
          area: "Central City",
          addressLine: "",
        },
      ],
    },
  });

  const {
    fields: itemFields,
    append: appendItem,
    remove: removeItem,
  } = useFieldArray({
    control,
    name: "items",
  });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({
    control,
    name: "deliveryAddresses",
  });

  const watchedItems = useWatch({ control, name: "items" }) ?? [];
  const watchedAddresses = useWatch({ control, name: "deliveryAddresses" }) ?? [];
  const deliveryDate = useWatch({ control, name: "deliveryDate" });
  const deliverySlot = useWatch({ control, name: "deliverySlot" });
  const manualAdjustment = useWatch({ control, name: "manualAdjustment" }) ?? 0;
  const paymentStatus = useWatch({ control, name: "paymentStatus" });

  const basePrice = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const unit = sizePriceMap[item.size] ?? 0;
      const qty = Number(item.quantity) || 0;
      return sum + unit * qty;
    }, 0);
  }, [watchedItems]);

  const addOnTotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const categoryAddOns = getCategoryAddOns(item.category);
      const perItemAddOn = (item.addOns ?? []).reduce((addonSum, addonId) => {
        const found = categoryAddOns.find((entry) => entry.id === addonId);
        return addonSum + (found?.price ?? 0);
      }, 0);
      return sum + perItemAddOn * (Number(item.quantity) || 0);
    }, 0);
  }, [watchedItems]);

  const deliveryFee = useMemo(() => {
    return watchedAddresses.reduce((sum, address) => {
      return sum + (deliveryFees[address.area] ?? 0);
    }, 0);
  }, [watchedAddresses]);

  const totalPrice = Math.max(0, basePrice + addOnTotal + deliveryFee + Number(manualAdjustment || 0));
  const downPaymentAmount = Math.round(totalPrice * 0.5);
  const remainingBalance =
    paymentStatus === "Paid"
      ? 0
      : paymentStatus === "DP Paid"
      ? Math.max(0, totalPrice - downPaymentAmount)
      : totalPrice;

  const selectedDate = deliveryDate ? new Date(deliveryDate) : null;
  const isBlockedDate = Boolean(
    selectedDate &&
      (blockedDates.includes(deliveryDate) || selectedDate.getDay() === 0)
  );

  const slotUsage = useMemo(() => {
    if (!deliveryDate || !deliverySlot) return 0;
    return orders.filter(
      (order) =>
        order.deliveryDate === deliveryDate &&
        order.deliverySlot === deliverySlot &&
        !["Cancelled", "Completed"].includes(order.orderStatus)
    ).length;
  }, [orders, deliveryDate, deliverySlot]);

  const isSlotFull = slotUsage >= slotLimitPerHour;

  const slotAvailability = useMemo(() => {
    if (!deliveryDate) return [];
    return deliverySlots.map((slot) => {
      const used = orders.filter(
        (order) =>
          order.deliveryDate === deliveryDate &&
          order.deliverySlot === slot &&
          !["Cancelled", "Completed"].includes(order.orderStatus)
      ).length;
      return {
        slot,
        used,
        full: used >= slotLimitPerHour,
      };
    });
  }, [orders, deliveryDate]);

  const onSubmit: SubmitHandler<BookingFormValues> = (values) => {
    if (isBlockedDate) {
      toast.error("Selected date is blocked. Please choose another date.");
      return;
    }
    if (isSlotFull) {
      toast.error("Delivery slot is full. Please choose another hour.");
      return;
    }

    const mappedItems = values.items.map((item, index) => {
      const unitPrice = sizePriceMap[item.size] ?? 0;
      const categoryAddOns = getCategoryAddOns(item.category);
      const addOnTotalForItem = (item.addOns ?? []).reduce((sum, addonId) => {
        const addon = categoryAddOns.find((entry) => entry.id === addonId);
        return sum + (addon?.price ?? 0);
      }, 0) * item.quantity;

      return {
        id: `item-${Date.now()}-${index}`,
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        basePrice: unitPrice * item.quantity,
        addOns: item.addOns,
        addOnTotal: addOnTotalForItem,
        notes: item.notes ?? "",
      };
    });

    const mappedAddresses = values.deliveryAddresses.map((address, index) => ({
      id: `addr-${Date.now()}-${index}`,
      label: address.label,
      area: address.area,
      addressLine: address.addressLine,
    }));

    addOrder({
      customerName: values.customerName,
      customerPhone: values.phoneNumber,
      deliveryDate: values.deliveryDate,
      deliverySlot: values.deliverySlot,
      notes: values.customNotes ?? "",
      items: mappedItems,
      deliveryAddresses: mappedAddresses,
      basePrice,
      addOnTotal,
      deliveryFee,
      manualAdjustment: Number(values.manualAdjustment || 0),
      totalPrice,
      downPaymentAmount,
      remainingBalance,
      paymentStatus: values.paymentStatus,
    });

    setDraftImported(false);
    setQuickPaste("");
    reset();
  };

  const toggleItemAddOn = (itemIndex: number, addonId: string) => {
    const current = watchedItems[itemIndex]?.addOns ?? [];
    const next = current.includes(addonId)
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setValue(`items.${itemIndex}.addOns`, next, { shouldValidate: true });
  };

  const importDraft = () => {
    if (!quickPaste.trim()) {
      toast.error("Paste an email or WhatsApp text first.");
      return;
    }
    const draft = parseEmailDraft(quickPaste);
    if (draft.customerName) setValue("customerName", draft.customerName);
    if (draft.phoneNumber) setValue("phoneNumber", draft.phoneNumber);
    if (draft.deliveryDate) setValue("deliveryDate", draft.deliveryDate);
    if (draft.deliverySlot) setValue("deliverySlot", draft.deliverySlot);
    if (draft.customNotes) setValue("customNotes", draft.customNotes);
    if (draft.items) setValue("items", draft.items);
    if (draft.deliveryAddresses) setValue("deliveryAddresses", draft.deliveryAddresses);
    setDraftImported(true);
    toast.success("Draft booking generated. Review and approve details.");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Import from Email / Quick Paste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 pt-0">
          <Textarea
            value={quickPaste}
            onChange={(event) => setQuickPaste(event.target.value)}
            placeholder={"Paste text and include hints like:\nName: Ayla\nPhone: 0812...\nDate: 2026-03-21\nSlot: 10:00\nProduct: Red velvet"}
            className="min-h-28"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700" onClick={importDraft}>
              <Upload size={16} />
              Import from Email
            </Button>
            <Button type="button" variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={importDraft}>
              Quick Paste to Draft
            </Button>
          </div>
          {draftImported && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              Draft imported. Please verify products, addresses, and pricing before creating booking.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 px-6 pb-6 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Customer Name
                <Input placeholder="Nadia Pratama" {...register("customerName")} />
                {errors.customerName && <span className="text-xs text-rose-500">{errors.customerName.message}</span>}
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Phone Number
                <Input placeholder="08xxxxxxxxxx" {...register("phoneNumber")} />
                {errors.phoneNumber && <span className="text-xs text-rose-500">{errors.phoneNumber.message}</span>}
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Delivery Date
                <Input type="date" {...register("deliveryDate")} />
                {errors.deliveryDate && <span className="text-xs text-rose-500">{errors.deliveryDate.message}</span>}
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Delivery Slot
                <Select {...register("deliverySlot")}>
                  <option value="">Select hour</option>
                  {deliverySlots.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </Select>
                {errors.deliverySlot && <span className="text-xs text-rose-500">{errors.deliverySlot.message}</span>}
              </label>
            </div>

            {(isBlockedDate || isSlotFull) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {isBlockedDate
                  ? "Selected date is unavailable. Sundays and blocked dates cannot be booked."
                  : `Selected slot is full (${slotUsage}/${slotLimitPerHour}). Please choose another hour.`}
              </div>
            )}

            {deliveryDate && (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Slot Availability ({deliveryDate})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {slotAvailability.map((entry) => (
                    <div
                      key={entry.slot}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        entry.full
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : entry.used > 0
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <div>{entry.slot}</div>
                      <div className="font-normal">{entry.full ? "Full" : `${entry.used}/${slotLimitPerHour} used`}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order Items</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 gap-1 border-indigo-200 text-indigo-700"
                  onClick={() =>
                    appendItem({
                      category: "Cake",
                      subcategory: "Birthday Cake",
                      productName: "Buttercream Classic",
                      size: "8 inch",
                      quantity: 1,
                      addOns: [],
                      notes: "",
                    })
                  }
                >
                  <Plus size={14} />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {itemFields.map((field, index) => {
                  const item = watchedItems[index];
                  const categoryData = productCatalog.find((entry) => entry.category === item?.category);
                  const subcategories = categoryData?.subcategories ?? [];
                  const subcategoryData = subcategories.find((entry) => entry.name === item?.subcategory) ?? subcategories[0];
                  const addOns = getCategoryAddOns(item?.category ?? "");

                  return (
                    <div key={field.id} className="space-y-3 rounded-xl border border-gray-200 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Category
                          <Select
                            {...register(`items.${index}.category`)}
                            onChange={(event) => {
                              const nextCategory = event.target.value;
                              const defaultSub = productCatalog.find((entry) => entry.category === nextCategory)?.subcategories[0];
                              setValue(`items.${index}.category`, nextCategory, { shouldValidate: true });
                              setValue(`items.${index}.subcategory`, defaultSub?.name ?? "", { shouldValidate: true });
                              setValue(`items.${index}.productName`, defaultSub?.products[0] ?? "", { shouldValidate: true });
                              setValue(`items.${index}.addOns`, [], { shouldValidate: true });
                            }}
                          >
                            {productCatalog.map((entry) => (
                              <option key={entry.category} value={entry.category}>{entry.category}</option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Subcategory
                          <Select
                            value={item?.subcategory ?? ""}
                            onChange={(event) => {
                              const nextSub = event.target.value;
                              const selectedSub = subcategories.find((entry) => entry.name === nextSub);
                              setValue(`items.${index}.subcategory`, nextSub, { shouldValidate: true });
                              setValue(`items.${index}.productName`, selectedSub?.products[0] ?? "", { shouldValidate: true });
                            }}
                          >
                            {subcategories.map((entry) => (
                              <option key={entry.name} value={entry.name}>{entry.name}</option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Product
                          <Select {...register(`items.${index}.productName`)}>
                            {(subcategoryData?.products ?? []).map((product) => (
                              <option key={product} value={product}>{product}</option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Size
                          <Select {...register(`items.${index}.size`)}>
                            {Object.keys(sizePriceMap).map((size) => (
                              <option key={size} value={size}>{size} ({formatCurrency(sizePriceMap[size])})</option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Quantity
                          <Input type="number" min={1} {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-3">
                          Item Notes
                          <Input placeholder="Decoration instructions" {...register(`items.${index}.notes`)} />
                        </label>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        {addOns.map((addon) => (
                          <label
                            key={addon.id}
                            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                          >
                            <span>{addon.label} <span className="text-xs text-gray-400">{formatCurrency(addon.price)}</span></span>
                            <input
                              type="checkbox"
                              checked={item?.addOns?.includes(addon.id) ?? false}
                              onChange={() => toggleItemAddOn(index, addon.id)}
                              className="h-4 w-4 accent-indigo-600"
                            />
                          </label>
                        ))}
                      </div>

                      {itemFields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 size={14} />
                          Remove Item
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery Addresses</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 gap-1 border-indigo-200 text-indigo-700"
                  onClick={() => appendAddress({ label: "Extra", area: "Central City", addressLine: "" })}
                >
                  <Plus size={14} />
                  Add Address
                </Button>
              </div>

              <div className="space-y-3">
                {addressFields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Label
                      <Input placeholder="Primary / Gift address" {...register(`deliveryAddresses.${index}.label`)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Area
                      <Select {...register(`deliveryAddresses.${index}.area`)}>
                        {Object.keys(deliveryFees).map((area) => (
                          <option key={area} value={area}>{area} ({formatCurrency(deliveryFees[area])})</option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                      Full Address
                      <Textarea className="min-h-20" placeholder="Street, block, note for courier" {...register(`deliveryAddresses.${index}.addressLine`)} />
                    </label>
                    {addressFields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-fit gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={() => removeAddress(index)}
                      >
                        <Trash2 size={14} />
                        Remove Address
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Payment Status
                <Select {...register("paymentStatus")}>
                  <option value="Pending">Pending</option>
                  <option value="DP Paid">DP Paid</option>
                  <option value="Paid">Paid</option>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Manual Adjustment (+/-)
                <Input type="number" step="1000" {...register("manualAdjustment", { valueAsNumber: true })} />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Notes
              <Textarea placeholder="Special handling, color palette, pickup notes" {...register("customNotes")} />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
                disabled={isBlockedDate || isSlotFull}
              >
                Create Booking
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  reset();
                  setQuickPaste("");
                  setDraftImported(false);
                }}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                Reset Form
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PriceSummaryCard
            basePrice={basePrice}
            addOnTotal={addOnTotal}
            deliveryFee={deliveryFee + Number(manualAdjustment || 0)}
            totalPrice={totalPrice}
          />
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Payment Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-600">
              <p className="flex items-center justify-between">
                <span>Down Payment (50%)</span>
                <span className="font-semibold text-gray-900">{formatCurrency(downPaymentAmount)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Remaining Balance</span>
                <span className="font-semibold text-gray-900">{formatCurrency(remainingBalance)}</span>
              </p>
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Formula: Final Price = Base + Add-ons + Ongkir + Manual adjustment.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
