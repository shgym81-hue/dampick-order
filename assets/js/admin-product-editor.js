/* 모든 상품이 공유하는 수정 창. 기존 주문의 상품 스냅샷은 변경하지 않습니다. */
window.createDampickProductEditor = function (sb, onSaved) {
  const dialog = document.getElementById("productEditDialog");
  const form = document.getElementById("productEditForm");
  const fields = {
    name: document.getElementById("editProductName"),
    unit_price: document.getElementById("editProductPrice"),
    unit_name: document.getElementById("editProductUnit"),
    pickup_date: document.getElementById("editProductPickupDate")
  };
  const message = document.getElementById("productEditMessage");
  const save = document.getElementById("saveProductEdit");
  const cancel = document.getElementById("cancelProductEdit");
  let productId = null;
  let busy = false;

  cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !productId) return;
    message.textContent = "";
    if (!form.reportValidity()) return;
    const price = fields.unit_price.value.trim();
    const payload = {
      name: fields.name.value.trim(),
      unit_price: Number(price),
      unit_name: fields.unit_name.value.trim(),
      pickup_date: fields.pickup_date.value
    };
    if (!payload.name || !payload.unit_name || !price || !Number.isSafeInteger(payload.unit_price) || payload.unit_price < 0 || !payload.pickup_date) {
      message.textContent = "상품명·단위·픽업 날짜와 0원 이상의 정수 가격을 입력해주세요.";
      return;
    }
    busy = true;
    [...Object.values(fields), save, cancel].forEach(control => { control.disabled = true; });
    save.textContent = "저장 중...";
    let saved = null;
    try {
      const { data, error } = await sb.from("products").update(payload)
        .eq("id", productId).eq("is_active", true).select("id,name,unit_price,unit_name,pickup_date").single();
      if (error) throw error;
      if (!data) throw new Error("상품이 내려졌거나 수정 권한이 없습니다. 목록을 새로고침해주세요.");
      saved = data;
      dialog.close();
    } catch (error) {
      message.textContent = "저장하지 못했습니다. " + (error.message || "연결 및 수정 권한을 확인해주세요.");
    } finally {
      busy = false;
      [...Object.values(fields), save, cancel].forEach(control => { control.disabled = false; });
      save.textContent = "변경 저장";
    }
    if (saved) await onSaved(saved);
  });

  return {
    open(product) {
      if (busy) return;
      productId = product.id;
      fields.name.value = product.name || "";
      fields.unit_price.value = product.unit_price ?? "";
      fields.unit_name.value = product.unit_name || "개";
      fields.pickup_date.value = String(product.pickup_date || "").slice(0, 10);
      message.textContent = "";
      dialog.showModal();
      fields.name.focus();
    }
  };
};
