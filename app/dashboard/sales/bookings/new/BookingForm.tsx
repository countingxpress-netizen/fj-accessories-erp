"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateNextDocNo } from "@/lib/docNumber";

type Customer = { id: string; name: string; default_print_rate: number | null; default_adhesive_rate: number | null };
type Warehouse = { id: string; name: string };
type Material = { id: string; material_name: string };
type CustomLine = { material_id: string; percentage: string };

type PendingItem = {
  style: string;
  customerBookingRef: string;
  productDetails: string;
  measurementType: "simple" | "adhesive" | "gusset";
  unit: "cm" | "inch";
  lengthVal: number;
  widthVal: number;
  flapVal: number;
  gussetVal: number;
  thicknessMm: number;
  productionThicknessMm: number;
  piThicknessMm: number;
  materialType: "pe_standard" | "pe_rld" | "pp" | "custom";
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  finalLbs: number;
  hasPrint: boolean;
  printColors: number;
  ratePerColor: number;
  ratePerInch: number;
  kg: number;
  bags: number;
  materialsNeeded: { name: string; qty: number }[];
  lengthCm: number;
  widthCm: number;
};

const LBS_PER_BAG = 55;
const CM_PER_INCH = 2.54;

type BuyerMaster = {
  id: string;
  customer_id: string;
  name: string;
  booking_thickness_mm: number | null;
  production_thickness_mm: number | null;
  pi_thickness_mm: number | null;
  print_colors_default: number | null;
  adhesive_rate_per_inch: number | null;
};
type GarmentMaster = { id: string; customer_id: string; name: string; address: string | null };

export default function BookingForm({
  customers, warehouses, materials, buyersMaster, garmentsMaster,
}: {
  customers: Customer[]; warehouses: Warehouse[]; materials: Material[];
  buyersMaster: BuyerMaster[]; garmentsMaster: GarmentMaster[];
}) {
  // Shared fields (একবার দিলেই সব item-এ থাকবে)
  const [customerId, setCustomerId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [buyerNameInput, setBuyerNameInput] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [garmentsId, setGarmentsId] = useState("");
  const [garmentsNameInput, setGarmentsNameInput] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryPoint, setDeliveryPoint] = useState("");
  const [hasPrint, setHasPrint] = useState(false);
  const [printColors, setPrintColors] = useState("");
  const [ratePerColor, setRatePerColor] = useState("0.20");
  const [ratePerInch, setRatePerInch] = useState("0.02");
  const [printLayoutNote, setPrintLayoutNote] = useState("");

  // Current item fields (Add Product চাপলে রিসেট হবে)
  const [style, setStyle] = useState("");
  const [customerBookingRef, setCustomerBookingRef] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [measurementType, setMeasurementType] = useState<"simple" | "adhesive" | "gusset">("simple");
  const [unit, setUnit] = useState<"cm" | "inch">("cm");
  const [lengthVal, setLengthVal] = useState("");
  const [widthVal, setWidthVal] = useState("");
  const [flapVal, setFlapVal] = useState("");
  const [gussetVal, setGussetVal] = useState("");
  const [thicknessMm, setThicknessMm] = useState("");
  const [productionThicknessMm, setProductionThicknessMm] = useState("");
  const [piThicknessMm, setPiThicknessMm] = useState("");
  const [materialType, setMaterialType] = useState<"pe_standard" | "pe_rld" | "pp" | "custom">("pe_standard");
  const [customLines, setCustomLines] = useState<CustomLine[]>([
    { material_id: "", percentage: "" },
    { material_id: "", percentage: "" },
  ]);
  const [quantity, setQuantity] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [buyersList, setBuyersList] = useState(buyersMaster);
  const [garmentsList, setGarmentsList] = useState(garmentsMaster);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function updateCustomLine(i: number, field: keyof CustomLine, value: string) {
    setCustomLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function addCustomLine() {
    setCustomLines((prev) => [...prev, { material_id: "", percentage: "" }]);
  }
  function removeCustomLine(i: number) {
    setCustomLines((prev) => prev.filter((_, idx) => idx !== i));
  }
  const customTotalPercent = customLines.reduce((s, l) => s + (parseFloat(l.percentage) || 0), 0);

  const L = parseFloat(lengthVal) || 0;
  const W = parseFloat(widthVal) || 0;
  const F = parseFloat(flapVal) || 0;
  const G = parseFloat(gussetVal) || 0;
  const T = parseFloat(thicknessMm) || 0;
  const PT = parseFloat(productionThicknessMm) || 0;
  const qty = parseFloat(quantity) || 0;

  const { tube, cutting } = useMemo(() => {
    if (measurementType === "simple") return { tube: W, cutting: L };
    if (measurementType === "adhesive") return { tube: L + F / 2, cutting: W };
    return { tube: W + G + G, cutting: L };
  }, [measurementType, L, W, F, G]);

  const calculated = useMemo(() => {
    if (!qty || !tube || !cutting || !T || !PT) return null;
    const tubeInch = unit === "cm" ? tube / CM_PER_INCH : tube;
    const cuttingInch = unit === "cm" ? cutting / CM_PER_INCH : cutting;
    const baseLbs = (qty * tubeInch * cuttingInch * PT) / 75000;
    const finalLbs = baseLbs * 1.01;

    let lldpe = 0, ldpe = 0, pp = 0, rld = 0;
    let customSplit: { material_id: string; qty: number }[] = [];

    if (materialType === "pe_standard") {
      lldpe = (finalLbs * 5) / 6;
      ldpe = finalLbs / 6;
    } else if (materialType === "pe_rld") {
      lldpe = finalLbs / 3;
      rld = finalLbs / 3;
      ldpe = finalLbs / 3;
    } else if (materialType === "pp") {
      pp = finalLbs;
    } else if (materialType === "custom") {
      customSplit = customLines
        .filter((l) => l.material_id && parseFloat(l.percentage) > 0)
        .map((l) => ({ material_id: l.material_id, qty: (finalLbs * parseFloat(l.percentage)) / 100 }));
    }

    return {
      tube, cutting, baseLbs, finalLbs,
      kg: finalLbs * 0.453592,
      bags: finalLbs / LBS_PER_BAG,
      lldpe, ldpe, pp, rld, customSplit,
    };
  }, [qty, tube, cutting, T, PT, unit, materialType, customLines]);

  async function checkDuplicateStyle() {
    if (!customerId || !style) return;
    const { data } = await supabase
      .from("bookings").select("booking_no").eq("customer_id", customerId).eq("style", style).limit(1);
    if (data && data.length > 0) {
      setWarning(`⚠ এই কাস্টমারের জন্য "${style}" স্টাইলে আগে থেকেই বুকিং আছে (${data[0].booking_no})। এটা কি সঠিক?`);
    } else {
      setHasPrint(false);
      setPrintColors("");
      setWarning("");
    }
  }

  function handleGarmentsChange(id: string) {
    setGarmentsId(id);
    const g = garmentsList.find((gm) => gm.id === id);
    setGarmentsNameInput(g?.name ?? "");
    if (g?.address) setDeliveryPoint(g.address);
  }

  function applyBuyerDefaults(selectedBuyerId: string) {
    if (!selectedBuyerId) return;

    const selectedBuyer = buyersList.find((b) => b.id === selectedBuyerId);
    if (!selectedBuyer) return;

    if (selectedBuyer.booking_thickness_mm != null) {
      setThicknessMm(String(selectedBuyer.booking_thickness_mm));
    }
    if (selectedBuyer.production_thickness_mm != null) {
      setProductionThicknessMm(String(selectedBuyer.production_thickness_mm));
    }
    if (selectedBuyer.pi_thickness_mm != null) {
      setPiThicknessMm(String(selectedBuyer.pi_thickness_mm));
    }
    if (selectedBuyer.print_colors_default != null) {
      setRatePerColor(String(selectedBuyer.print_colors_default));
    }
    if (selectedBuyer.adhesive_rate_per_inch != null) {
      setRatePerInch(String(selectedBuyer.adhesive_rate_per_inch));
    }
  }

  async function ensureBuyerForCurrentCustomer() {
    const trimmedName = buyerNameInput.trim();
    if (!customerId) return { buyerId: null as string | null, buyerName: null as string | null };

    if (buyerId) {
      const selectedBuyer = buyersList.find((b) => b.id === buyerId);
      return { buyerId, buyerName: (selectedBuyer?.name ?? buyerNameInput.trim()) || null };
    }

    if (!trimmedName) return { buyerId: null, buyerName: null };

    const existingBuyer = buyersList.find(
      (b) => b.customer_id === customerId && b.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingBuyer) {
      setBuyerId(existingBuyer.id);
      setBuyerNameInput(existingBuyer.name);
      return { buyerId: existingBuyer.id, buyerName: existingBuyer.name };
    }

    const { data, error } = await supabase
      .from("buyers")
      .insert({
        customer_id: customerId,
        name: trimmedName,
        pricing_rule: "manual",
        percentage_value: 0,
        rate_per_lbs_value: 0,
      })
      .select("id, name")
      .single();

    if (error) throw error;
    if (data) {
      setBuyersList((prev) => [
        ...prev,
        {
          id: data.id,
          customer_id: customerId,
          name: data.name,
          booking_thickness_mm: null,
          production_thickness_mm: null,
          pi_thickness_mm: null,
          print_colors_default: null,
          adhesive_rate_per_inch: null,
        },
      ]);
      setBuyerId(data.id);
      setBuyerNameInput(data.name);
      return { buyerId: data.id, buyerName: data.name };
    }

    return { buyerId: null, buyerName: trimmedName };
  }

  async function ensureGarmentsForCurrentCustomer() {
    const trimmedName = garmentsNameInput.trim();
    if (!customerId) return { garmentsId: null as string | null, garmentsName: null as string | null };

    if (garmentsId) {
      const selectedGarment = garmentsList.find((g) => g.id === garmentsId);
      return { garmentsId, garmentsName: (selectedGarment?.name ?? garmentsNameInput.trim()) || null };
    }

    if (!trimmedName) return { garmentsId: null, garmentsName: null };

    const existingGarment = garmentsList.find(
      (g) => g.customer_id === customerId && g.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingGarment) {
      setGarmentsId(existingGarment.id);
      setGarmentsNameInput(existingGarment.name);
      return { garmentsId: existingGarment.id, garmentsName: existingGarment.name };
    }

    const { data, error } = await supabase
      .from("garments")
      .insert({
        customer_id: customerId,
        name: trimmedName,
        address: deliveryPoint.trim() || null,
      })
      .select("id, name, address")
      .single();

    if (error) throw error;
    if (data) {
      setGarmentsList((prev) => [...prev, { id: data.id, customer_id: customerId, name: data.name, address: data.address ?? null }]);
      setGarmentsId(data.id);
      setGarmentsNameInput(data.name);
      if (data.address) setDeliveryPoint(data.address);
      return { garmentsId: data.id, garmentsName: data.name };
    }

    return { garmentsId: null, garmentsName: trimmedName };
  }

  function resetItemFields() {
    setStyle("");
    setCustomerBookingRef("");
    setProductDetails("");
    setMeasurementType("simple");
    setUnit("cm");
    setLengthVal("");
    setWidthVal("");
    setFlapVal("");
    setGussetVal("");
    setThicknessMm("");
    setProductionThicknessMm("");
    setPiThicknessMm("");
    setMaterialType("pe_standard");
    setCustomLines([{ material_id: "", percentage: "" }, { material_id: "", percentage: "" }]);
    setQuantity("");
    setWarehouseId("");
    setWarning("");
  }

  function buildPendingItemFromCurrent(): PendingItem | null {
    if (!calculated || !qty || !warehouseId) return null;

    const materialsNeeded: { name: string; qty: number }[] = [];
    if (materialType === "pe_standard") {
      materialsNeeded.push({ name: "LLDPE", qty: calculated.lldpe });
      materialsNeeded.push({ name: "LDPE", qty: calculated.ldpe });
    } else if (materialType === "pe_rld") {
      materialsNeeded.push({ name: "LLDPE", qty: calculated.lldpe });
      materialsNeeded.push({ name: "Recycled Chips", qty: calculated.rld });
      materialsNeeded.push({ name: "LDPE", qty: calculated.ldpe });
    } else if (materialType === "pp") {
      materialsNeeded.push({ name: "PP", qty: calculated.pp });
    } else {
      calculated.customSplit.forEach((c) => {
        const mat = materials.find((m) => m.id === c.material_id);
        if (mat) materialsNeeded.push({ name: mat.material_name, qty: c.qty });
      });
    }

    const lengthCm = unit === "cm" ? cutting : cutting * CM_PER_INCH;
    const widthCm = unit === "cm" ? tube : tube * CM_PER_INCH;
    const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? "-";

    return {
      style, customerBookingRef, productDetails,
      measurementType, unit, lengthVal: L, widthVal: W, flapVal: F, gussetVal: G, thicknessMm: T,
      productionThicknessMm: PT,
      piThicknessMm: parseFloat(piThicknessMm) || 0,
      materialType, quantity: qty, warehouseId, warehouseName,
      finalLbs: calculated.finalLbs, kg: calculated.kg, bags: calculated.bags,
      materialsNeeded, lengthCm, widthCm, hasPrint, printColors: parseInt(printColors) || 0,
      ratePerColor: parseFloat(ratePerColor) || 0.20,
      ratePerInch: parseFloat(ratePerInch) || 0.02,
    };
  }

  function handleAddProduct() {
    setError("");
    if (materialType === "custom" && Math.abs(customTotalPercent - 100) > 0.1) {
      setError(`Custom Material-এর মোট শতাংশ ১০০% হতে হবে (বর্তমানে ${customTotalPercent.toFixed(1)}%)।`);
      return;
    }
    const item = buildPendingItemFromCurrent();
    if (!item) {
      setError("Measurement, Quantity ও Warehouse ঠিকমতো দিন — তারপর যোগ করুন।");
      return;
    }
    setPendingItems((prev) => [...prev, item]);
    resetItemFields();
  }

  function removePendingItem(index: number) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (materialType === "custom" && Math.abs(customTotalPercent - 100) > 0.1 && qty > 0) {
      setError(`Custom Material-এর মোট শতাংশ ১০০% হতে হবে (বর্তমানে ${customTotalPercent.toFixed(1)}%)।`);
      return;
    }

    // যদি বর্তমান ফর্মে ভরা ডেটা থাকে কিন্তু "Add Product" চাপা না হয়ে থাকে, সেটাও যোগ করে নিন
    let allItems = pendingItems;
    const currentItem = buildPendingItemFromCurrent();
    if (currentItem) {
      allItems = [...pendingItems, currentItem];
    }

    if (!customerId || allItems.length === 0) {
      setError("Customer বাছুন এবং অন্তত একটা প্রোডাক্ট (Measurement + Quantity + Warehouse) যোগ করুন।");
      return;
    }

    setLoading(true);

    const groupId = crypto.randomUUID();
    const sharedBookingNo = await generateNextDocNo(supabase, "bookings", "booking_no", "BK", "booking_date", bookingDate);

    let merchantId: string | null = null;
    if (merchantName.trim()) {
      const { data: existingMerchant } = await supabase
        .from("merchants").select("id").eq("name", merchantName.trim()).maybeSingle();
      merchantId = existingMerchant
        ? existingMerchant.id
        : (await supabase.from("merchants").insert({ name: merchantName.trim() }).select().single()).data?.id ?? null;
    }

    const { data: allMaterials } = await supabase.from("raw_materials").select("id, material_name");
    const materialMap: Record<string, string> = {};
    (allMaterials ?? []).forEach((m) => (materialMap[m.material_name] = m.id));

    // সব item-এর স্টক আগে থেকে যাচাই করুন
    for (const item of allItems) {
      for (const m of item.materialsNeeded) {
        const materialId = materialMap[m.name];
        if (!materialId) continue;
        const { data: stock } = await supabase
          .from("raw_material_stock").select("quantity_lbs")
          .eq("material_id", materialId).eq("warehouse_id", item.warehouseId).maybeSingle();
        const currentQty = stock?.quantity_lbs ?? 0;
        if (currentQty < m.qty) {
          setLoading(false);
          setError(`"${item.style || item.productDetails}" — ${m.name}-এ পর্যাপ্ত স্টক নেই (আছে ${currentQty.toFixed(2)} Lbs, প্রয়োজন ${m.qty.toFixed(2)} Lbs)।`);
          return;
        }
      }
    }

    const { buyerId: resolvedBuyerId } = await ensureBuyerForCurrentCustomer();
    const { garmentsId: resolvedGarmentsId, garmentsName: resolvedGarmentsName } = await ensureGarmentsForCurrentCustomer();

    const year = new Date(bookingDate).getFullYear();

    for (const item of allItems) {
      // Finished Goods খুঁজুন/তৈরি করুন
      const productName = item.productDetails || `${item.style || "Product"} (${item.lengthCm.toFixed(1)}x${item.widthCm.toFixed(1)})`;
      const { data: existingProduct } = await supabase
        .from("finished_goods").select("id")
        .eq("length_cm", Number(item.lengthCm.toFixed(3)))
        .eq("width_cm", Number(item.widthCm.toFixed(3)))
        .eq("thickness", item.thicknessMm)
        .maybeSingle();

      let productId = existingProduct?.id;
      if (!productId) {
        const { data: newProduct } = await supabase
          .from("finished_goods")
          .insert({ product_name: productName, length_cm: item.lengthCm, width_cm: item.widthCm, thickness: item.thicknessMm })
          .select().single();
        productId = newProduct?.id;
      }
      if (!productId) continue;

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          booking_no: sharedBookingNo, customer_id: customerId, buyer_id: resolvedBuyerId, merchant_id: merchantId,
          style: item.style, product_details: item.productDetails, product_id: productId,
          measurement_type: item.measurementType, measurement_unit: item.unit,
          length_val: item.lengthVal, width_val: item.widthVal,
          flap_val: item.flapVal || null, gusset_val: item.gussetVal || null,
          thickness_mm: item.thicknessMm, production_thickness_mm: item.productionThicknessMm,
          pi_thickness_mm: item.piThicknessMm,
          material_type: item.materialType,
          quantity_pcs: item.quantity, booking_date: bookingDate,
          required_lbs: Number(item.finalLbs.toFixed(2)),
          required_kg: Number(item.kg.toFixed(2)),
          required_bags: Number(item.bags.toFixed(2)),
          delivery_point: deliveryPoint, print_layout_note: printLayoutNote,
          has_print: item.hasPrint, print_colors: item.printColors,
          rate_per_color: item.ratePerColor, rate_per_inch: item.ratePerInch,
          garments_name: resolvedGarmentsName ?? null,
          garments_id: resolvedGarmentsId || null, booking_group_id: groupId,
          customer_booking_ref: item.customerBookingRef || null,
          warehouse_id: item.warehouseId, status: "in_production",
        })
        .select().single();

      if (bookingError || !booking) {
        setLoading(false);
        setError(`"${item.style || item.productDetails || 'একটি প্রোডাক্ট'}" সেভ করতে ব্যর্থ হয়েছে: ${bookingError?.message ?? 'অজানা কারণ'}`);
        return;
      }

      const productionNo = await generateNextDocNo(supabase, "production_orders", "production_no", "PROD", "order_date", bookingDate);
      const { data: productionOrder } = await supabase
        .from("production_orders")
        .insert({
          production_no: productionNo, booking_id: booking.id, product_id: productId,
          quantity_pcs: item.quantity, stage: "blowing", required_lbs: item.finalLbs, order_date: bookingDate,
        })
        .select().single();

      for (const m of item.materialsNeeded) {
        const materialId = materialMap[m.name];
        if (!materialId || m.qty <= 0) continue;

        await supabase.from("booking_materials").insert({
          booking_id: booking.id, material_id: materialId, quantity_lbs: m.qty,
        });

        const { data: stock } = await supabase
          .from("raw_material_stock").select("*")
          .eq("material_id", materialId).eq("warehouse_id", item.warehouseId).maybeSingle();

        if (stock) {
          await supabase.from("raw_material_stock")
            .update({ quantity_lbs: stock.quantity_lbs - m.qty, updated_at: new Date().toISOString() })
            .eq("id", stock.id);
        }

        await supabase.from("stock_ledger").insert({
          item_type: "raw_material", item_id: materialId, warehouse_id: item.warehouseId,
          txn_type: "out", quantity: m.qty, reference_type: "production",
          reference_id: productionOrder?.id, txn_date: bookingDate,
        });

        if (productionOrder) {
          await supabase.from("material_consumption").insert({
            production_id: productionOrder.id, material_id: materialId,
            quantity_lbs: m.qty, consumption_date: bookingDate,
          });
        }
      }
    }

    setLoading(false);
    router.push("/dashboard/sales/bookings");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4 max-w-3xl">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <select
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setWarning(""); setBuyerId(""); setBuyerNameInput(""); setGarmentsId(""); setGarmentsNameInput(""); setDeliveryPoint("");
              const newCustomerId = e.target.value; 
const selected = customers.find((c) => String(c.id) === String(newCustomerId));
              
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            required
          >
            <option value="">-- বাছুন --</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Buyer</label>
          <select
            value={buyerId}
            onChange={(e) => {
              const nextBuyerId = e.target.value;
              setBuyerId(nextBuyerId);
              const selected = buyersList.find((b) => b.id === nextBuyerId);
              setBuyerNameInput(selected?.name ?? "");
              if (nextBuyerId) {
                applyBuyerDefaults(nextBuyerId);
              }
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">-- বাছুন --</option>
            {buyersList.filter((b) => b.customer_id === customerId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input value={buyerNameInput} onChange={(e) => { setBuyerNameInput(e.target.value); if (!e.target.value.trim()) setBuyerId(""); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="নতুন Buyer লিখুন" />
          <p className="mt-1 text-xs text-gray-500">নতুন Buyer লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Merchant Name</label>
          <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Merchant নাম" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Garments</label>
          <select value={garmentsId} onChange={(e) => handleGarmentsChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">-- বাছুন --</option>
            {garmentsList.filter((g) => g.customer_id === customerId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input value={garmentsNameInput} onChange={(e) => { setGarmentsNameInput(e.target.value); if (!e.target.value.trim()) setGarmentsId(""); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="নতুন Garments লিখুন" />
          <p className="mt-1 text-xs text-gray-500">নতুন Garments লিখলে সাবমিটের সময় অটোমেটিক যোগ হবে</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Style (স্বয়ংক্রিয়ভাবে ST- যোগ হবে)</label>
          <input value={style} onChange={(e) => setStyle(e.target.value)} onBlur={checkDuplicateStyle} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="যেমন: 1024" />
          {style && !style.startsWith("ST-") && <p className="text-xs text-gray-500 mt-1">দেখাবে: ST-{style}</p>}
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Customer Booking Ref</label>
          <input value={customerBookingRef} onChange={(e) => setCustomerBookingRef(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="কাস্টমারের নিজস্ব বুকিং নম্বর" />
        </div>
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm text-gray-600 mb-1">Product Details</label>
          <input value={productDetails} onChange={(e) => setProductDetails(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="PE 02 Color Poly Bags 10 mm" />
        </div>
      </div>

      {warning && <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2">{warning}</p>}

      <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
        <p className="text-sm font-semibold text-gray-700">Measurement</p>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={measurementType} onChange={(e) => setMeasurementType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="simple">Simple (L x W)</option>
              <option value="adhesive">Adhesive (L + Flap x W)</option>
              <option value="gusset">Gusset (L x W + G + G)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="cm">cm</option>
              <option value="inch">inch</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Length (L)</label>
            <input type="number" step="0.01" value={lengthVal} onChange={(e) => setLengthVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Width (W)</label>
            <input type="number" step="0.01" value={widthVal} onChange={(e) => setWidthVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
          {measurementType === "adhesive" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Flap (F)</label>
              <input type="number" step="0.01" value={flapVal} onChange={(e) => setFlapVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
            </div>
          )}
          {measurementType === "gusset" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gusset (G, একপাশে)</label>
              <input type="number" step="0.01" value={gussetVal} onChange={(e) => setGussetVal(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Order Thickness (mm, 0-30)</label>
            <input type="number" step="0.001" min="0" max="30" value={thicknessMm} onChange={(e) => setThicknessMm(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Production Thickness (mm)</label>
            <input type="number" step="0.001" min="0" max="30" value={productionThicknessMm} onChange={(e) => setProductionThicknessMm(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PI Thickness (mm)</label>
            <input type="number" step="0.001" min="0" max="30" value={piThicknessMm} onChange={(e) => setPiThicknessMm(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-28" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Material Type</label>
          <select value={materialType} onChange={(e) => setMaterialType(e.target.value as any)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="pe_standard">PE (LLDPE:LDPE = 5:1)</option>
            <option value="pe_rld">PE-RLD (LLDPE:RLD:LDPE = 2.5:2.5:2.5)</option>
            <option value="pp">PP</option>
            <option value="custom">Custom (নিজের মতো লিখুন)</option>
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasPrint} onChange={(e) => setHasPrint(e.target.checked)} />
            Print আছে?
          </label>
          {hasPrint && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">কয় Color</label>
                <input type="number" min="0" value={printColors} onChange={(e) => setPrintColors(e.target.value)} className="w-24 rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate/Color/Pc</label>
                <input type="number" step="0.01" value={ratePerColor} onChange={(e) => setRatePerColor(e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" />
              </div>
            </>
          )}
        </div>

        {measurementType === "adhesive" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rate/Inch (Adhesive)</label>
            <input type="number" step="0.001" value={ratePerInch} onChange={(e) => setRatePerInch(e.target.value)} className="w-28 rounded-lg border px-3 py-2 text-sm" />
          </div>
        )}

        {materialType === "custom" && (
          <div className="w-full rounded-lg border p-3 bg-gray-50 space-y-2">
            <p className="text-xs text-gray-500">প্রতিটা Material-এর শতাংশ (%) দিন, মোট ১০০% হতে হবে</p>
            {customLines.map((line, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={line.material_id} onChange={(e) => updateCustomLine(i, "material_id", e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm">
                  <option value="">-- Material বাছুন --</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                </select>
                <input type="number" step="0.1" placeholder="%" value={line.percentage} onChange={(e) => updateCustomLine(i, "percentage", e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
                {customLines.length > 2 && (
                  <button type="button" onClick={() => removeCustomLine(i)} className="text-red-600 text-xs hover:underline">সরান</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addCustomLine} className="text-xs text-gray-600 border border-dashed rounded px-2 py-1 hover:bg-gray-100">
              + আরেকটি Material যোগ করুন
            </button>
            <p className={`text-xs ${Math.abs(customTotalPercent - 100) < 0.1 ? "text-green-600" : "text-orange-600"}`}>
              মোট: {customTotalPercent.toFixed(1)}% {Math.abs(customTotalPercent - 100) < 0.1 ? "✓" : "(১০০% হতে হবে)"}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-600 mb-1">Quantity (Pcs)</label>
          <input type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-32" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Warehouse (কাঁচামাল কাটবে)</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm min-w-[180px]">
            <option value="">-- বাছুন --</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {calculated && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-1">
          <p className="text-sm font-medium text-blue-900">
            Tube: {calculated.tube.toFixed(2)} {unit} | Cutting: {calculated.cutting.toFixed(2)} {unit}
          </p>
          <p className="text-sm text-blue-800">
            Required (1% সহ): <strong>{calculated.finalLbs.toFixed(2)} Lbs</strong> ≈ {calculated.kg.toFixed(2)} Kg ≈ {calculated.bags.toFixed(2)} Bags
          </p>
          {materialType === "pe_standard" && (
            <p className="text-sm text-blue-800">LLDPE: {calculated.lldpe.toFixed(2)} Lbs | LDPE: {calculated.ldpe.toFixed(2)} Lbs</p>
          )}
          {materialType === "pe_rld" && (
            <p className="text-sm text-blue-800">LLDPE: {calculated.lldpe.toFixed(2)} Lbs | Recycled Chips: {calculated.rld.toFixed(2)} Lbs | LDPE: {calculated.ldpe.toFixed(2)} Lbs</p>
          )}
          {materialType === "pp" && (
            <p className="text-sm text-blue-800">PP: {calculated.pp.toFixed(2)} Lbs</p>
          )}
          {materialType === "custom" && (
            <p className="text-sm text-blue-800">
              {calculated.customSplit.map((c) => `${materials.find((m) => m.id === c.material_id)?.material_name}: ${c.qty.toFixed(2)} Lbs`).join(" | ") || "শতাংশ দিন"}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddProduct}
        className="rounded-lg border-2 border-dashed border-gray-400 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
      >
        + এই বুকিং-এ আরো প্রোডাক্ট যোগ করুন
      </button>

      {pendingItems.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            যোগ করা প্রোডাক্ট তালিকা ({pendingItems.length}টি)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Required Lbs</th>
                <th className="px-3 py-2">Warehouse</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((item, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{item.style || "-"}</td>
                  <td className="px-3 py-2">{item.customerBookingRef || "-"}</td>
                  <td className="px-3 py-2">{item.productDetails || "-"}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{item.finalLbs.toFixed(2)}</td>
                  <td className="px-3 py-2">{item.warehouseName}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removePendingItem(i)} className="text-red-600 text-xs hover:underline">সরান</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Booking Date</label>
          <input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" required />
        </div>
        <div className="flex-1 min-w-[280px]">
          <label className="block text-sm text-gray-600 mb-1">Delivery Point (পূর্ণ ঠিকানা)</label>
          {garmentsId && garmentsMaster.find((g) => g.id === garmentsId)?.address && (
            <button
              type="button"
              onClick={() => setDeliveryPoint(garmentsMaster.find((g) => g.id === garmentsId)!.address!)}
              className="text-xs text-blue-600 hover:underline mb-1"
            >
              Garments-এর ঠিকানা ব্যবহার করুন
            </button>
          )}
          <input value={deliveryPoint} onChange={(e) => setDeliveryPoint(e.target.value)} list="delivery-point-options" className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="সম্পূর্ণ ডেলিভারি ঠিকানা লিখুন" />
          <datalist id="delivery-point-options">
            {garmentsList.filter((g) => g.customer_id === customerId && g.address).map((g) => (
              <option key={g.id} value={g.address ?? ""} />
            ))}
          </datalist>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm text-gray-600 mb-1">Print Layout Note (ঐচ্ছিক)</label>
          <input value={printLayoutNote} onChange={(e) => setPrintLayoutNote(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="ফাইল আপলোড ফিচার পরে যোগ হবে" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 px-5 py-2 text-sm text-white disabled:opacity-40">
        {loading ? "সেভ হচ্ছে..." : `Booking সেভ করুন (${pendingItems.length + (calculated && qty && warehouseId ? 1 : 0)}টি প্রোডাক্ট, + Production Order অটো তৈরি)`}
      </button>
    </form>
  );
}