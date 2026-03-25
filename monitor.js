require("dotenv").config({ path: "./.env" });
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const fs = require("fs");

// ===== CONFIG =====
const URL = "https://gs.vadp.gov.vn/Account/Login";
const DATA_FILE = "data.txt";

// ===== DEBUG ENV =====
console.log("ENV USER:", process.env.ID || "❌ undefined");
console.log("ENV PASS:", process.env.PASSWORD ? "✅ loaded" : "❌ undefined");

// ===== EMAIL =====
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

// ===== GỬI EMAIL =====
async function sendEmail(message) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL,
      to: process.env.RECEIVER,
      subject: "🚨 Có cập nhật mới từ hệ thống",
      text: message,
    });
    console.log("📩 Đã gửi email");
  } catch (err) {
    console.error("❌ Lỗi gửi email:", err.message);
  }
}

// ===== LOGIN + LẤY DATA =====
async function getData() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // 👉 timeout global
    page.setDefaultTimeout(15000);

    console.log("🌐 Đang mở trang...");
    await page.goto(URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // ===== LOGIN =====
    console.log("🔐 Đang login...");

    await page.waitForSelector("input[name='username']");
    await page.type("input[name='username']", process.env.ID, { delay: 30 });

    await page.waitForSelector("input[name='password']");
    await page.type("input[name='password']", process.env.PASSWORD, { delay: 30 });

    await Promise.all([
      page.keyboard.press("Enter"),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
    ]);

    console.log("👉 URL sau login:", page.url());

    // ===== LẤY THÔNG BÁO =====
    let notificationCount = "0";

    try {
      const badgeSelector = "#header_notification_bar .badge";

      await page.waitForSelector(badgeSelector, { timeout: 10000 });

      notificationCount = await page.$eval(badgeSelector, (el) =>
        el.innerText.trim()
      );

      if (!notificationCount) notificationCount = "0";

      console.log("🎯 Số thông báo:", notificationCount);
    } catch (e) {
      console.log("⚠️ Không tìm thấy badge");

      const html = await page.content();
      fs.writeFileSync("debug.html", html);
      console.log("👉 Đã lưu debug.html");
    }

    return notificationCount;
  } catch (err) {
    console.error("❌ Lỗi Puppeteer:", err.message);
    return "0";
  } finally {
    if (browser) await browser.close();
  }
}

// ===== SO SÁNH =====
async function checkChange() {
  try {
    console.log("🔍 Đang kiểm tra...");

    const newData = await getData();

    let oldData = "0";
    if (fs.existsSync(DATA_FILE)) {
      oldData = fs.readFileSync(DATA_FILE, "utf-8");
    }

    console.log("Old:", oldData);
    console.log("New:", newData);

    // lần đầu chạy
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, newData);
      console.log("📌 Lưu dữ liệu lần đầu");
      return;
    }

    // chỉ gửi khi tăng
    if (parseInt(newData) > parseInt(oldData)) {
      console.log("🚨 Có thông báo mới!");
      await sendEmail(`Bạn có ${newData} thông báo mới!`);
      fs.writeFileSync(DATA_FILE, newData);
    } else {
      console.log("✅ Không có thông báo mới");
    }
  } catch (err) {
    console.error("❌ Lỗi checkChange:", err.message);
  }
}

// ===== CHẠY =====
(async () => {
  await checkChange();

  // 👉 CHỈ loop khi chạy local (KHÔNG phải GitHub)
  if (!process.env.GITHUB_ACTIONS) {
    setInterval(checkChange, 5 * 60 * 1000);
  } else {
    console.log("✅ Done (GitHub Actions mode)");
  }
})();