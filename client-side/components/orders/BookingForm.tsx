"use client";

import { useMemo } from "react";
import { SubmitHandler, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceSummaryCard } from "@/components/orders/PriceSummaryCard";
import { formatCurrency } from "@/components/orders/formatters";

const bookingSchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  phoneNumber: z.string().min(8, "Phone number is required"),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  cakeType: z.string().min(1, "Cake type is required"),
  size: z.string().min(1, "Size is required"),
  addOns: z.array(z.string()),
  customNotes: z.string().max(300).optional().or(z.literal("")),
  deliveryArea: z.string().min(1, "Delivery area is required"),
  paymentStatus: z.enum(["DP", "Paid", "Pending"]),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const addOnOptions = [
  { label: "Extra flowers", value: "flowers", price: 35000 },
  { label: "Gold topper", value: "topper", price: 45000 },
  { label: "Custom greeting", value: "greeting", price: 25000 },
  { label: "Premium box", value: "box", price: 40000 },
];

const basePriceMap: Record<string, Record<string, number>> = {
  Buttercream: {
    "6 inch": 220000,
    "8 inch": 320000,
    "10 inch": 450000,
  },
  Ganache: {
    "6 inch": 250000,
    "8 inch": 360000,
    "10 inch": 510000,
  },
  "Red Velvet": {
    "6 inch": 270000,
    "8 inch": 380000,
    "10 inch": 520000,
  },
};

const deliveryFees: Record<string, number> = {
  "Central City": 20000,
  "North District": 30000,
  "South District": 25000,
  "Outside Area": 45000,
};

export function BookingForm() {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      deliveryDate: "",
      cakeType: "",
      size: "",
      addOns: [],
      customNotes: "",
      deliveryArea: "",
      paymentStatus: "Pending",
    },
  });

  const selectedAddOns = useWatch({ control, name: "addOns" });
  const selectedCake = useWatch({ control, name: "cakeType" });
  const selectedSize = useWatch({ control, name: "size" });
  const selectedArea = useWatch({ control, name: "deliveryArea" });

  const basePrice = useMemo(() => {
    if (!selectedCake || !selectedSize) return 0;
    return basePriceMap[selectedCake]?.[selectedSize] ?? 0;
  }, [selectedCake, selectedSize]);

  const addOnTotal = useMemo(() => {
    return addOnOptions
      .filter((option) => selectedAddOns?.includes(option.value))
      .reduce((sum, option) => sum + option.price, 0);
  }, [selectedAddOns]);

  const deliveryFee = deliveryFees[selectedArea] ?? 0;
  const totalPrice = basePrice + addOnTotal + deliveryFee;

  const onSubmit: SubmitHandler<BookingFormValues> = (values) => {
    console.log("Booking submitted", values);
  };

  const toggleAddOn = (value: string) => {
    const current = selectedAddOns ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setValue("addOns", next, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Customer & Delivery Info</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Customer Name
              <Input placeholder="Nadia Pratama" {...register("customerName")} />
              {errors.customerName && (
                <span className="text-xs text-rose-500">
                  {errors.customerName.message}
                </span>
              )}
            </label>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Phone Number
              <Input placeholder="08xxxxxxxxxx" {...register("phoneNumber")} />
              {errors.phoneNumber && (
                <span className="text-xs text-rose-500">
                  {errors.phoneNumber.message}
                </span>
              )}
            </label>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Delivery Date
              <Input type="date" {...register("deliveryDate")} />
              {errors.deliveryDate && (
                <span className="text-xs text-rose-500">
                  {errors.deliveryDate.message}
                </span>
              )}
            </label>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Delivery Area
              <Select {...register("deliveryArea")}>
                <option value="">Select area</option>
                {Object.keys(deliveryFees).map((area) => (
                  <option key={area} value={area}>
                    {area} ({formatCurrency(deliveryFees[area])})
                  </option>
                ))}
              </Select>
              {errors.deliveryArea && (
                <span className="text-xs text-rose-500">
                  {errors.deliveryArea.message}
                </span>
              )}
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Cake Type
              <Select {...register("cakeType")}>
                <option value="">Select cake</option>
                {Object.keys(basePriceMap).map((cake) => (
                  <option key={cake} value={cake}>
                    {cake}
                  </option>
                ))}
              </Select>
              {errors.cakeType && (
                <span className="text-xs text-rose-500">
                  {errors.cakeType.message}
                </span>
              )}
            </label>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Size
              <Select {...register("size")}>
                <option value="">Select size</option>
                {selectedCake
                  ? Object.keys(basePriceMap[selectedCake] ?? {}).map((size) => (
                      <option key={size} value={size}>
                        {size} ({formatCurrency(basePriceMap[selectedCake][size])})
                      </option>
                    ))
                  : [
                      "6 inch",
                      "8 inch",
                      "10 inch",
                    ].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
              </Select>
              {errors.size && (
                <span className="text-xs text-rose-500">
                  {errors.size.message}
                </span>
              )}
            </label>
          </div>

          <div className="grid gap-3">
            <span className="text-sm font-medium text-gray-700">Add-ons</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {addOnOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
                >
                  <span>
                    {option.label}
                    <span className="ml-2 text-xs text-gray-400">
                      {formatCurrency(option.price)}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedAddOns?.includes(option.value) ?? false}
                    onChange={() => toggleAddOn(option.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Custom Notes
            <Textarea placeholder="Color theme, message on cake, etc." {...register("customNotes")} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Payment Status
            <Select {...register("paymentStatus")}>
              <option value="Pending">Pending</option>
              <option value="DP">DP</option>
              <option value="Paid">Paid</option>
            </Select>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="gap-2">
              Create Booking
            </Button>
            <Button variant="outline" type="button">
              Save Draft
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <PriceSummaryCard
          basePrice={basePrice}
          addOnTotal={addOnTotal}
          deliveryFee={deliveryFee}
          totalPrice={totalPrice}
        />
        <Card>
          <CardHeader>
            <CardTitle>Summary Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>Delivery area fee is applied automatically based on location.</p>
            <p>Ensure payment status matches the latest invoice progress.</p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
