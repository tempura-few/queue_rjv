"use client";

// Date Picker สไตล์ MUI X (https://mui.com/x/react-date-pickers/date-picker/)
// ธีมสีตามโรงพยาบาล + ป้าย/เดือนภาษาไทย — ใช้ร่วมกันทั้งหน้าจองและหลังบ้าน
//
// Responsive: จอแคบ (มือถือ/แท็บเล็ต) → MobileDatePicker เปิดเป็น dialog เต็มจอเหมาะกับนิ้ว
//            จอกว้าง (เดสก์ท็อป) → DesktopDatePicker เปิดเป็นปฏิทินลอยเลือกเร็ว
// เลือกด้วยความกว้าง viewport แทนการ detection อัตโนมัติของ MUI (ใช้ pointer: coarse)
// เพราะ webview/อุปกรณ์บางรุ่นรายงาน pointer ผิด ทำให้จอคอมโดน UI มือถือทั้งที่กว้าง 1280px
import { DesktopDatePicker } from "@mui/x-date-pickers/DesktopDatePicker";
import { MobileDatePicker } from "@mui/x-date-pickers/MobileDatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { th, enUS } from "date-fns/locale";
import { thTH } from "@mui/x-date-pickers/locales";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useLang } from "@/lib/i18n.js";

const theme = createTheme({
  palette: {
    primary: { main: "#13497F" },
    background: { default: "#fff" },
  },
  typography: {
    fontFamily: '"Sarabun", "Noto Sans Thai", -apple-system, "Segoe UI", sans-serif',
  },
});

// value/onChange ใช้รูปแบบเดียวกับ input type="date" เดิม คือสตริง "YYYY-MM-DD" (หรือ "" / null)
export default function ThDatePicker({ value, onChange, label, minDate, maxDate, size = "small", sx, ...rest }) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [lang] = useLang(); // ผู้ป่วยสลับเป็น EN/MY ได้ — ปฏิทินเปลี่ยน locale ตาม (หลังบ้านคงไทย)
  // date-fns ไม่มี locale ภาษาพม่า — โหมด MY ใช้ปฏิทินภาษาอังกฤษแทน (เลือกวันที่เป็นตัวเลข dd/MM/yyyy เหมือนเดิม)
  const locale = lang === "th" ? th : enUS;
  const Picker = isMobile ? MobileDatePicker : DesktopDatePicker;
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider
        dateAdapter={AdapterDateFns}
        adapterLocale={locale}
        localeText={lang === "th" ? thTH.components.MuiLocalizationProvider.defaultProps.localeText : undefined}
      >
        <Picker
          label={label}
          value={value ? new Date(value + "T00:00:00") : null}
          onChange={(d) => onChange(d ? toISO(d) : "")}
          format="dd/MM/yyyy"
          minDate={minDate}
          maxDate={maxDate}
          slotProps={{ textField: { size, sx: { width: 175, ...sx } } }}
          {...rest}
        />
      </LocalizationProvider>
    </ThemeProvider>
  );
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
