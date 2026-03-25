require("dotenv").config({ path: "./.env" });
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const fs = require("fs");

// ===== CONFIG =====
const URL = "https://gs.vadp.gov.vn/Account/Login";

// ===== DEBUG ENV =====
console.log("ENV USER:", process.env.ID);
console.log("ENV PASS:", process.env.PASSWORD);

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
  await transporter.sendMail({
    from: process.env.EMAIL,
    to: process.env.RECEIVER,
    subject: "🚨 Có cập nhật mới từ hệ thống",
    text: message,
  });
}

// ===== LOGIN + LẤY DATA =====
async function getData() {
  const browser = await puppeteer.launch({
    headless: true, // chạy ổn rồi thì đổi true
    slowMo: 50,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.goto(URL, {
    waitUntil: "networkidle2",
  });

  // ===== LOGIN =====
  await page.waitForSelector("input[name='username']");

  // clear + nhập username
  await page.click("input[name='username']", { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type("input[name='username']", process.env.ID, { delay: 50 });

  // clear + nhập password
  await page.waitForSelector("input[name='password']");
  await page.click("input[name='password']", { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type("input[name='password']", process.env.PASSWORD, { delay: 50 });

  // DEBUG xem nhập đúng chưa
  const values = await page.evaluate(() => ({
    user: document.querySelector("input[name='username']")?.value,
    pass: document.querySelector("input[name='password']")?.value,
  }));
  console.log("👉 Đã nhập:", values);

  // submit
  await page.keyboard.press("Enter");

  // ===== ĐỢI LOGIN =====
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("👉 URL sau login:", page.url());

  // ===== LẤY THÔNG BÁO =====
  let notificationCount = "0";

  try {
    // Sửa selector trỏ thẳng vào đúng icon bell
    const badgeSelector = "#header_notification_bar .badge";
    await page.waitForSelector(badgeSelector, { timeout: 10000 });

    notificationCount = await page.$eval(badgeSelector, (el) =>
      el.innerText.trim()
    );

    // Nếu span rỗng (không có text), gán về 0 để tránh lỗi so sánh logic
    if (!notificationCount) {
        notificationCount = "0";
    }

    console.log("🎯 Số thông báo:", notificationCount);
  } catch (e) {
    console.log("⚠️ Không tìm thấy badge");

    // dump HTML để debug nếu cần
    const html = await page.content();
    fs.writeFileSync("debug.html", html);
    console.log("👉 Đã lưu debug.html");
  }

  await browser.close();
  return notificationCount;
}

// ===== SO SÁNH =====
async function checkChange() {
  try {
    console.log("🔍 Đang kiểm tra...");

    const newData = await getData();

    let oldData = "0";
    if (fs.existsSync("data.txt")) {
      oldData = fs.readFileSync("data.txt", "utf-8");
    }

    console.log("Old:", oldData);
    console.log("New:", newData);

    if (!fs.existsSync("data.txt")) {
      fs.writeFileSync("data.txt", newData);
      return;
    }

    if (parseInt(newData) > parseInt(oldData)) {
      console.log("🚨 Có thông báo mới!");

      await sendEmail(`Bạn có ${newData} thông báo mới!`);

      fs.writeFileSync("data.txt", newData);
    } else {
      console.log("✅ Không có thông báo mới");
    }
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
  }
}

// ===== CHẠY =====
(async () => {
  await checkChange();
  setInterval(checkChange, 10 * 60 * 1000);
})();