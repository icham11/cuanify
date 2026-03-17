import { formatCurrency } from "@/components/orders/formatters";

export const bakerySummaryCards = [
  { title: "Total Orders", value: "128" },
  { title: "Confirmed Orders", value: "92" },
  { title: "In Production", value: "24" },
  { title: "Delivered", value: "86" },
  { title: "Total Revenue", value: formatCurrency(84500000) },
];

export const bakeryOrdersPerDay = [
  { day: "Mon", orders: 14 },
  { day: "Tue", orders: 20 },
  { day: "Wed", orders: 18 },
  { day: "Thu", orders: 24 },
  { day: "Fri", orders: 30 },
  { day: "Sat", orders: 22 },
  { day: "Sun", orders: 16 },
];

export const bakeryRevenueTrend = [
  { day: "Mon", revenue: 9800000 },
  { day: "Tue", revenue: 12300000 },
  { day: "Wed", revenue: 10200000 },
  { day: "Thu", revenue: 16400000 },
  { day: "Fri", revenue: 19200000 },
  { day: "Sat", revenue: 13800000 },
  { day: "Sun", revenue: 9100000 },
];

export const bakeryUpcomingDeliveries = [
  {
    id: "ORD-9302",
    customer: "Alya Putri",
    product: "8 inch Red Velvet",
    date: "Mar 20, 2026",
  },
  {
    id: "ORD-9305",
    customer: "Dimas Ardi",
    product: "10 inch Buttercream",
    date: "Mar 21, 2026",
  },
  {
    id: "ORD-9310",
    customer: "Regina Sari",
    product: "6 inch Ganache",
    date: "Mar 22, 2026",
  },
];

export const bakeryOrders = [
  {
    id: "9302",
    resi: "ORD-9302",
    customerName: "Alya Putri",
    deliveryDate: "2026-03-20",
    product: "8 inch Red Velvet",
    totalPrice: 480000,
    paymentStatus: "DP",
    orderStatus: "Confirmed",
  },
  {
    id: "9305",
    resi: "ORD-9305",
    customerName: "Dimas Ardi",
    deliveryDate: "2026-03-21",
    product: "10 inch Buttercream",
    totalPrice: 620000,
    paymentStatus: "Paid",
    orderStatus: "In Production",
  },
  {
    id: "9310",
    resi: "ORD-9310",
    customerName: "Regina Sari",
    deliveryDate: "2026-03-22",
    product: "6 inch Ganache",
    totalPrice: 340000,
    paymentStatus: "Pending",
    orderStatus: "Pending",
  },
  {
    id: "9316",
    resi: "ORD-9316",
    customerName: "Farhan Yusuf",
    deliveryDate: "2026-03-23",
    product: "8 inch Buttercream",
    totalPrice: 410000,
    paymentStatus: "DP",
    orderStatus: "Confirmed",
  },
];

export const bakeryOrderDetail = {
  customer: {
    name: "Alya Putri",
    phone: "+62 812 3456 7890",
    address: "Central City, Blok A-12",
  },
  order: {
    cakeType: "Red Velvet",
    size: "8 inch",
    deliveryDate: "Mar 20, 2026",
    addOns: "Gold topper, Custom greeting",
    notes: "Palette: ivory & sage. Keep frosting smooth.",
  },
  pricing: {
    basePrice: 360000,
    addOnTotal: 70000,
    deliveryFee: 20000,
  },
  paymentStatus: "DP",
  orderStatus: "Pending",
};

export const bakeryProductionOrders = [
  {
    id: "ORD-9302",
    customer: "Alya Putri",
    deliveryDate: "Mar 20, 2026",
    product: "8 inch Red Velvet",
    notes: "Ivory theme, add gold topper.",
    status: "Confirmed",
  },
  {
    id: "ORD-9305",
    customer: "Dimas Ardi",
    deliveryDate: "Mar 21, 2026",
    product: "10 inch Buttercream",
    notes: "Extra strawberries on top.",
    status: "In Production",
  },
  {
    id: "ORD-9310",
    customer: "Regina Sari",
    deliveryDate: "Mar 22, 2026",
    product: "6 inch Ganache",
    notes: "Gift wrap, deliver before noon.",
    status: "Pending",
  },
];

export const bakeryReportStats = [
  { title: "Orders This Month", value: "248" },
  { title: "Average Order Value", value: formatCurrency(385000) },
  { title: "Repeat Customers", value: "62%" },
  { title: "On-time Delivery", value: "94%" },
];

export const bakeryRevenueByWeek = [
  { week: "Week 1", revenue: 42000000 },
  { week: "Week 2", revenue: 51000000 },
  { week: "Week 3", revenue: 47000000 },
  { week: "Week 4", revenue: 56000000 },
];

export const bakeryStatusMix = [
  { name: "Confirmed", value: 42, color: "#3b82f6" },
  { name: "In Production", value: 28, color: "#6366f1" },
  { name: "Ready", value: 18, color: "#a855f7" },
  { name: "Delivered", value: 65, color: "#10b981" },
];
