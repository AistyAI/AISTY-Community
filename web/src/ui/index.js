// Aisty Free UI kit.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ui.css";
import { LockIcon } from "./icons";

// Buttons and fields

export const Button = ({ variant = "primary", size = "medium", className = "", children, type = "button", ...props }) => (
  <button type={type} className={`btn ${variant} ${size} ${className}`.trim()} {...props}>
    {children}
  </button>
);

export const Input = ({ label, id, ...props }) => {
  const autoId = useRef(`in-${Math.random().toString(36).slice(2, 9)}`).current;
  const fieldId = id || autoId;
  return (
    <div className="inputWrapper">
      {label && <label className="inputLabel" htmlFor={fieldId}>{label}</label>}
      <input id={fieldId} className="inputField" {...props} />
    </div>
  );
};

export const Textarea = ({ label, id, ...props }) => {
  const autoId = useRef(`ta-${Math.random().toString(36).slice(2, 9)}`).current;
  const fieldId = id || autoId;
  return (
    <div className="textareaWrapper">
      {label && <label className="textareaLabel" htmlFor={fieldId}>{label}</label>}
      <textarea id={fieldId} className="textareaField" {...props} />
    </div>
  );
};

export const Select = ({ label, options = [], value, onValueChange, id, ...props }) => {
  const autoId = useRef(`se-${Math.random().toString(36).slice(2, 9)}`).current;
  const fieldId = id || autoId;
  const handleChange = (e) => {
    const val = e.target.value;
    onValueChange?.(val !== "" && !Number.isNaN(Number(val)) ? Number(val) : val);
  };
  return (
    <div className="selectWrapper">
      {label && <label className="selectLabel" htmlFor={fieldId}>{label}</label>}
      <select id={fieldId} className="selectField" value={value} onChange={handleChange} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};

// Popup

export const Popup = ({ show, onClose, children }) => {
  useEffect(() => {
    if (!show || !onClose) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  return createPortal(
    <div className={`popUpLayer ${show ? "show" : ""}`} aria-hidden={!show}>
      <div className="popUpScrim" onClick={() => onClose?.()} />
      <div className={`popUp ${show ? "show" : ""}`} role="dialog" aria-modal="true">
        {show ? children : null}
      </div>
    </div>,
    document.body,
  );
};

// Toasts

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const addToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), 4500);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => remove(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Layout shell

const NavButton = ({ item }) => (
  <button
    type="button"
    onClick={item.onClick}
    className={`dashboardTab ${item.active ? "is-active" : ""} ${item.locked ? "is-locked" : ""}`.trim()}
    title={item.locked ? `${item.label} comes with hosted Aisty` : undefined}
    aria-current={item.active ? "page" : undefined}
  >
    {item.icon}
    <span className="dashboardTab__label">{item.label}</span>
    {item.locked && <LockIcon size={13} className="navLock" />}
  </button>
);

export const Dashboard = ({ logo, tabs = [], content, footerButtons = [], banner = null, footerTop = null }) => {
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (!menuVisible) return undefined;
    const close = (e) => {
      if (!e.target.closest(".sideNav") && !e.target.closest(".hamburger")) setMenuVisible(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuVisible]);

  return (
    <div className="dashboardContainer">
      <button type="button" className="hamburger" aria-label="Open menu" onClick={() => setMenuVisible((v) => !v)}>
        ☰
      </button>
      {menuVisible && <div className="navScrim" onClick={() => setMenuVisible(false)} />}

      <div className={`nav ${menuVisible ? "show" : ""}`}>
        <div className="sideNav">
          {logo}
          <nav aria-label="Workspace">
            {tabs.map((tab) => <NavButton key={tab.label} item={tab} />)}
          </nav>
        </div>
        <div className="buttonContainer">
          {footerTop}
          {footerButtons.map((btn) => <NavButton key={btn.label} item={btn} />)}
        </div>
      </div>

      <div className="tabs">
        {banner}
        {content}
      </div>
    </div>
  );
};

export * from "./icons";
