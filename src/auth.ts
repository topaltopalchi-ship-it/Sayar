const PIN_KEY = "sai-sai-pin";

export function hasPin(): boolean {
  return Boolean(localStorage.getItem(PIN_KEY));
}

export function savePin(pin: string): void {
  localStorage.setItem(PIN_KEY, pin);
}

export function checkPin(pin: string): boolean {
  return localStorage.getItem(PIN_KEY) === pin;
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY);
}

export function authScreen(onSuccess: () => void): void {
  const existing = hasPin();
  const title = existing ? "ورود به سای‌سای" : "ساخت رمز ورود سای‌سای";
  const action = existing ? "ورود" : "ثبت رمز";

  document.querySelector("#auth-lock")?.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "auth-lock";
  wrapper.className = "modal-backdrop";

  wrapper.innerHTML = `
    <section class="modal">
      <h2>${title}</h2>
      <p class="muted">
        ${existing
          ? "رمز ورود خود را وارد کنید."
          : "یک رمز ۴ تا ۶ رقمی برای محافظت از اطلاعات انتخاب کنید."}
      </p>
      <input
        id="auth-pin"
        type="password"
        inputmode="numeric"
        maxlength="6"
        placeholder="رمز ورود"
        autocomplete="off"
      />
      <p id="auth-error" class="muted" role="alert"></p>
      <button id="auth-submit" class="primary-button wide">
        ${action}
      </button>
    </section>
  `;

  document.body.appendChild(wrapper);

  const input = wrapper.querySelector<HTMLInputElement>("#auth-pin")!;
  const error = wrapper.querySelector<HTMLElement>("#auth-error")!;
  const button = wrapper.querySelector<HTMLButtonElement>("#auth-submit")!;

  const submit = () => {
    const pin = input.value.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      error.textContent = "رمز باید ۴ تا ۶ رقم باشد.";
      return;
    }

    if (existing && !checkPin(pin)) {
      error.textContent = "رمز واردشده اشتباه است.";
      input.value = "";
      input.focus();
      return;
    }

    if (!existing) {
      savePin(pin);
    }

    wrapper.remove();
    onSuccess();
  };

  button.addEventListener("click", submit);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submit();
    }
  });

  input.focus();
}
