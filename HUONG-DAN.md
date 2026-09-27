# PixelBatch: hướng dẫn đưa app lên Microsoft Store

PixelBatch là app đổi đuôi, resize và nén ảnh hàng loạt (PNG/JPG/WebP). App chạy offline, và ảnh không bao giờ rời khỏi máy người dùng.

## Có gì trong thư mục

| File | Dùng để |
|---|---|
| `index.html`, `style.css`, `app.js` | Code chính của app |
| `manifest.json`, `sw.js` | Biến web thành app cài được và chạy offline (PWA) |
| `jszip.min.js` | Thư viện nén file .zip, để sẵn trong thư mục để chạy offline |
| `icons/` | Icon của app |
| `privacy.html` | Trang chính sách quyền riêng tư (Store bắt buộc phải có) |
| `store-assets/` | Ảnh chụp màn hình và logo 1024px để đăng lên Store |

## Bước 1: Chạy thử trên máy

Cách nhanh nhất là mở Terminal trong thư mục này rồi chạy:

```
npx serve .
```

Sau đó mở `http://localhost:3000` bằng Edge. Nếu máy chưa có Node.js, bạn có thể double-click `index.html`. Làm vậy app vẫn đổi ảnh được, chỉ có chế độ offline là không hoạt động.

## Bước 2: Đưa app lên mạng bằng GitHub Pages (miễn phí)

PWABuilder cần app có một đường link công khai để đóng gói.

1. Tạo tài khoản ở github.com, rồi tạo repository mới tên `pixelbatch` và để chế độ **Public**.
2. Bấm **Add file → Upload files** và kéo **toàn bộ file** trong thư mục này vào (không cần thư mục `store-assets`).
3. Vào **Settings → Pages**, phần Source chọn `main` / `root`, rồi bấm **Save**.
4. Đợi 1–2 phút, bạn sẽ có link dạng `https://<tên-bạn>.github.io/pixelbatch/`.
5. Mở `privacy.html`, thay `YOUR_EMAIL_HERE` bằng email của bạn rồi upload lại.

## Bước 3: Tạo tài khoản Microsoft Partner Center (miễn phí)

1. Vào https://storedeveloper.microsoft.com, đăng ký loại **Individual** và xác minh danh tính.
2. Trong Partner Center, vào **Apps and games → New product → MSIX or PWA app**.
3. **Đặt giữ tên app**, ví dụ `PixelBatch - Image Converter`. Nếu tên bị trùng thì thử tên khác.
4. Vào **Product management → Product Identity** và ghi lại 3 thông tin: **Package/Identity name**, **Publisher** (dạng `CN=...`) và **Publisher display name**.

## Bước 4: Đóng gói bằng PWABuilder

1. Vào https://www.pwabuilder.com, dán link GitHub Pages của bạn rồi bấm **Start**.
2. Bấm **Package for stores → Windows** và điền 3 thông tin ở Bước 3.
3. Tải về file zip. Bên trong có file `.msixbundle`, là file dùng để nộp lên Store.

## Bước 5: Nộp bài lên Store

Trong Partner Center, bấm **Start submission** và điền lần lượt:

- **Pricing and availability**: chọn Free, áp dụng cho tất cả thị trường.
- **Properties**: chọn category **Photo & video**, và điền link privacy là `https://<tên-bạn>.github.io/pixelbatch/privacy.html`.
- **Age ratings**: trả lời bảng câu hỏi (app không có nội dung nhạy cảm nên kết quả sẽ là 3+).
- **Packages**: upload file `.msixbundle`.
- **Store listings (English)**:
  - Description: dán đoạn mô tả bên dưới.
  - Screenshots: dùng 2 ảnh trong `store-assets/`.
  - Store logo: dùng `store-logo-1024.png`.
- Bấm **Submit**. Microsoft thường duyệt trong 1–3 ngày.

### Mô tả mẫu (tiếng Anh)

> **Convert, resize and compress hundreds of images in one click.**
> PixelBatch turns PNG, JPG and WebP files into the format you need, fast and fully offline. Your photos never leave your PC.
>
> • Batch convert to JPG, PNG or WebP
> • Resize by max width, max height or percentage
> • Adjust quality to shrink file size (often 50–80% smaller)
> • Drag & drop, paste from clipboard, or "Open with" from File Explorer
> • Download one by one or all at once as a ZIP
> • Light and dark mode, no ads, no sign-in

**Từ khóa gợi ý:** image converter, batch resize, compress images, webp converter, png to jpg, photo resizer

## Bước 6: Sau khi app lên Store

- Theo dõi **Analytics** để biết số lượt tải và từ khóa người dùng tìm.
- Khi app đã có người dùng, mình có thể thêm bản **Pro** bán dưới dạng add-on (khoảng $2–3). Bản Pro có thể mở khóa xử lý không giới hạn số ảnh, đổi tên hàng loạt, đóng dấu watermark hoặc chuyển sang PDF. PWA thanh toán qua Store bằng *Digital Goods API*, và mình sẽ giúp bạn làm phần này ở bước sau.
- Mỗi lần sửa app, bạn chỉ cần upload code mới lên GitHub rồi đổi `pixelbatch-v1` trong `sw.js` thành `v2`, `v3`… PWA sẽ tự cập nhật, không cần nộp lại lên Store (trừ khi bạn đổi icon hoặc tên app).
