# Thuật toán chia chi phí và hoàn tiền

Ngày cập nhật: 26/09/2026. Trạng thái: đã có module chạy độc lập, ví dụ và kiểm thử;
chưa có giao diện, API hay cơ sở dữ liệu của website.

## 1. Đã kiểm tra được gì từ chiahoadon.com?

[Hướng dẫn số dư](https://chiahoadon.com/help/who-owes-whom) mô tả hai phương án:
chuyển trực tiếp để giảm số lượt, hoặc thu qua một người trung gian. Số dư dựa trên
các khoản chi và hoàn trả.

[Hướng dẫn trả nợ](https://chiahoadon.com/help/settle-up) mô tả bước người chuyển ghi
nhận rồi người nhận xác nhận; khi còn chờ thì số dư chưa đổi.

Ngày 26/09/2026, người dùng đã đăng nhập và cho phép kiểm tra trực tiếp. Với nhóm
thử sáu người có số dư `+48.000, +42.000, +36.000, −54.000, −48.000, −24.000` đồng,
website đề xuất 5 lượt trong chế độ ít lượt nhất, còn module của dự án tìm được
4 lượt. Đã xác minh cả hai phương án trả đúng tiền. Trường hợp sau một khoản hoàn
trả mẫu cũng cho kết quả tương tự: website 5 lượt, module 4 lượt.

Chi tiết, phạm vi chức năng và bằng chứng có trong
[báo cáo kiểm tra sau đăng nhập](chiahoadon-audit-2026-09-26.md).
Chưa kiểm tra mã nguồn máy chủ, nên không khẳng định website dùng greedy hay một
thuật toán cụ thể nào khác. Các bảng benchmark ở phần 8 vẫn là so sánh giữa hai
thuật toán do dự án tự hiện thực, không phải phép đo tốc độ website.

## 2. Mục tiêu và phạm vi bảo đảm

Module có hai chế độ. Các phần 4–6 mô tả **ít lần chuyển nhất**; chế độ **gom về
một người**, hợp đồng trả kết quả và ví dụ chia cho nhóm con nằm trong
[thiết kế hai chế độ](settlement-modes.md).

- Tối thiểu **số lượt chuyển tiền** để đưa mọi số dư về 0.
- Người đang nợ có thể chuyển trực tiếp cho bất kỳ người đang được nhận nào trong
  cùng nhóm. Có thể trả cho người không trực tiếp thanh toán hộ mình ở hóa đơn gốc.
- Mỗi lần tính chỉ có một loại tiền. Lớp API phải kiểm tra đơn vị tiền của nhóm và
  các khoản chi; module thuần toán chỉ nhận số tiền theo đơn vị nhỏ nhất.
- Sau khi ghép các cặp số dư đối nhau, còn tối đa 20 người: bảo đảm chính xác,
  `optimal: true`. Mặc định `exactLimit: 20`; có thể giảm ngưỡng để giảm tài nguyên.
- Phần còn lại lớn hơn ngưỡng: dùng phương án nhanh. Nếu đạt cận dưới thì vẫn
  chứng nhận tối ưu; nếu chưa đạt, `optimal: false` nghĩa là **chưa chứng nhận tối
  ưu**, không có nghĩa phương án chắc chắn kém tối ưu.
- Không tối ưu phí ngân hàng, hạn mức từng người hay yêu cầu chỉ trả cho một số
  người nhất định. Những ràng buộc đó sẽ thay đổi bài toán.
- Số người còn công nợ quyết định kích thước bài toán. Nhóm 100 người nhưng chỉ
  12 người còn số dư vẫn dùng thuật toán chính xác.

## 3. Tính phần chi và số dư

Mỗi khoản chi có tổng tiền, danh sách người đã thanh toán và danh sách phần phải chịu.
Một khoản có thể được nhiều người cùng thanh toán; người thanh toán có thể không tham gia sử dụng.
Một bữa ăn chỉ có 15/20 người thì danh sách phần chi chỉ chứa 15 người đó.

```text
số dư = tổng đã thanh toán − tổng phần phải chịu
       + tổng đã hoàn trả được xác nhận − tổng đã nhận hoàn trả được xác nhận
```

Dương: được nhận. Âm: cần trả. Tổng số dư phải bằng 0.

Tiền được lưu bằng số nguyên theo đơn vị nhỏ nhất; với VND là đồng. Chia đều
100.000 đồng cho ba người cho kết quả 33.334, 33.333 và 33.333 đồng. Chia theo trọng
số sử dụng cách phân bổ phần dư lớn nhất: lấy phần nguyên của từng tỷ lệ, sau đó
phân bổ các đồng còn lại cho phần thập phân lớn nhất; nếu bằng nhau, ưu tiên ID
thành viên theo thứ tự tăng dần. Cách này ổn định khi đổi thứ tự hiển thị, nhưng
không có mục tiêu luân phiên người chịu đồng lẻ qua nhiều hóa đơn. Phải lưu các
phần tiền đã tính cùng khoản chi để lịch sử có thể đối chiếu.

Các tích và tổng trung gian dùng `BigInt`. Đầu vào và kết quả công khai dùng số
nguyên an toàn của JavaScript. Tổng số dư dương phải không vượt
`Number.MAX_SAFE_INTEGER` (9.007.199.254.740.991), nhờ đó mọi tổng của tập con đều
chính xác trong bảng DP. Cơ sở giới hạn này nằm trong
[đặc tả ECMAScript](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.max_safe_integer).

`splitWeighted` nhận trọng số nguyên tương đối. Nếu giao diện nhận phần trăm,
chuyển sang phần vạn (12,5% → 1250) và kiểm tra tổng bằng 10000 trước khi gọi.
Module không tự phân biệt phần trăm với trọng số thông thường.

## 4. Vì sao ghép số tiền lớn nhất chưa đủ?

Ví dụ số dư, đơn vị nghìn đồng:

| Thành viên | Số dư |
|---|---:|
| A | +80 |
| B | +70 |
| C | +60 |
| D | −90 |
| E | −80 |
| F | −40 |

Cách luôn ghép số nợ còn lại lớn nhất với số được nhận còn lại lớn nhất cần 5 lượt:
D → A 80; E → B 70; F → C 40; D → C 10; E → C 10.

Phương án chính xác chỉ cần 4 lượt:

| Người chuyển | Người nhận | Số tiền |
|---|---|---:|
| D | B | 70.000đ |
| D | C | 20.000đ |
| E | A | 80.000đ |
| F | C | 40.000đ |

Ba lượt là không thể: cả ba người nợ và cả ba người được nhận đều phải tham gia,
nên ba lượt đòi hỏi ghép ba cặp có số dư đối nhau hoàn toàn; ở đây chỉ A/E có thể
ghép như vậy. Bốn lượt đạt được, nên bốn là tối ưu.

Ví dụ này chứng minh hạn chế của greedy. Một bộ số dư cùng tỷ lệ, nhân với 0,6,
đã được nhập trực tiếp vào website tham khảo ngày 26/09/2026 và cũng nhận 5 lượt
thay vì cực tiểu 4 lượt; danh sách chuyển tiền của website khác danh sách greedy
ở trên. Xem báo cáo kiểm tra để không nhầm hai danh sách.

## 5. Thuật toán chính xác

### Rút gọn và kiểm tra trước khi tìm kiếm

1. Bỏ người có số dư bằng 0; ghép các cặp `+x` và `−x` thành một lượt trả đủ.
2. Gọi `p` là số cặp đã ghép, `d` và `c` là số người nợ/được nhận còn lại. Cận dưới
   cho tổng số lượt là `p + max(d, c)`: mỗi người còn công nợ phải có ít nhất một
   giao dịch, mỗi giao dịch trực tiếp chỉ phục vụ một người nợ và một người nhận.
3. Chạy heap trên phần còn lại. Nếu tổng số lượt bằng cận dưới, trả kết quả ngay
   với `proof: 'lower-bound'`, kể cả nhóm hơn 20 người.
4. Nếu chưa chứng nhận và phần còn lại không vượt `exactLimit`, dùng DP dưới đây.
   Nếu vượt ngưỡng, trả phương án heap với `optimal: false` và cận dưới để đối chiếu.

Ghép cặp không làm mất nghiệm tối ưu: nếu hai người có số dư đối nhau thuộc hai
nhóm tổng 0 khác nhau trong một phân hoạch tối ưu, thay hai nhóm đó bằng cặp này
và phần còn lại của hợp hai nhóm. Vẫn có hai nhóm tổng 0. Nếu cùng một nhóm, tách
cặp cũng không làm giảm số nhóm. Lặp lại bước này vẫn giữ cực tiểu toàn cục.

`preprocess: false` tắt ghép cặp; kết hợp `exactLimit: 0` dùng làm mốc so sánh heap
thuần. Không cần truyền các tùy chọn này khi tích hợp thông thường.

### Quy hoạch động cho phần còn lại

Gọi `n` là số người có số dư khác 0. Chia họ thành nhiều tập con rời nhau có tổng
số dư bằng 0 nhất có thể. Nếu có `k` tập, số lượt chuyển nhỏ nhất là `n − k`.
Mối liên hệ giữa phân hoạch tổng 0 và số lượt hoàn tiền được trình bày trong
[Patcas và Bartha, 2019, trang 146–147](https://acta.sapientia.ro/content/docs/evolutionary-solving-of-the-debts-cleari.pdf).
Mã trong dự án được tự hiện thực; dùng quy hoạch động chính xác, không dùng thuật
toán tiến hóa của bài báo.

Lập luận: mỗi thành phần liên thông của một phương án hoàn tiền phải có tổng số
dư bằng 0. Thành phần có `s` người cần ít nhất `s − 1` cạnh chuyển tiền. Ngược lại,
có thể hoàn tất bất kỳ tập tổng 0 nào trong tối đa `s − 1` lượt bằng cách ghép
người nợ và người được nhận. Vì vậy phân hoạch có nhiều tập nhất đạt đúng cực tiểu.

Module dùng mặt nạ bit và quy hoạch động:

```text
sum[mask] = tổng số dư của tập thành viên trong mask
dp[0] = 0
dp[mask] = max(dp[mask bỏ i], với mọi i thuộc mask)
           + (sum[mask] == 0 ? 1 : 0)
```

`dp[mask]` là số đoạn đầu có tổng 0 lớn nhất trong một thứ tự sắp xếp của tập đó.
Với tập có tổng khác 0, không diễn giải nó là số nhóm của một phân hoạch hoàn chỉnh.
Khi tổng toàn bộ bằng 0, các điểm cắt tổng 0 xác định các tập con tối ưu. Lưu thành
viên được chọn để khôi phục thứ tự, cắt nhóm rồi ghép nợ trong từng nhóm. Vì các
nhóm đã là phân hoạch tối ưu, bước ghép trong từng nhóm vẫn đạt số lượt tối thiểu.

Độ phức tạp: `O(n × 2^n)` thời gian, `O(2^n)` bộ nhớ. Tại `n = 20`:
1.048.576 trạng thái, 10.485.760 lần xét chuyển trạng thái, khoảng 10 MiB cho ba
mảng chính. Ngưỡng 20 được chặn cứng để tránh tăng tài nguyên theo cấp số nhân.

## 6. Thuật toán nhanh cho nhóm lớn

Dùng hai heap, mỗi bước lấy người còn nợ nhiều nhất và người còn được nhận nhiều
nhất, chuyển phần nhỏ hơn rồi cập nhật. Độ phức tạp `O(n log n)`, bộ nhớ `O(n)` và
tối đa `n − 1` lượt với `n > 0`. Mọi số dư vẫn về 0, nhưng số lượt có thể chưa ít nhất.

Kết quả trả thêm `method`, `proof`, `lowerBound`, `pairedMembers`,
`remainingMembers`, `optimal`, `optimalityScope`, `activeMembers` và
`transactionCount`. `method: 'greedy'` vẫn có thể đi cùng `optimal: true` nếu đã
chứng minh đạt cận dưới. Trong chế độ `min-transfers`, giao diện có thể dùng:

- `optimal: true`: “Phương án ít lượt chuyển nhất”.
- `optimal: false`: “Phương án gợi ý để hoàn tất công nợ”.

## 7. Tích hợp vào website

Mã nguồn: `src/settlement.mjs`. Không phụ thuộc framework hoặc thư viện bên ngoài.
Điểm vào chung cho hai chế độ là `suggestSettlements(balances, options)`; xem
[hợp đồng backend và chế độ người gom](settlement-modes.md). Các hàm trực tiếp
`optimizeSettlements` và `collectSettlements` vẫn có thể gọi độc lập.

```js
import { splitEqual, calculateBalances, optimizeSettlements } from './src/settlement.mjs';

const memberIds = ['an', 'binh', 'chi'];
const expenses = [{
  id: 'expense-001',
  amountMinor: 300000,
  payers: [{ memberId: 'an', amountMinor: 300000 }],
  shares: splitEqual(300000, memberIds),
}];

const balances = calculateBalances({ memberIds, expenses, settlements: [] });
const plan = optimizeSettlements(balances);
// binh -> an: 100000; chi -> an: 100000; plan.optimal === true
```

Khi xây API:

1. Máy chủ xác thực quyền sửa nhóm, đơn vị tiền, ID thành viên và tổng khoản chi.
   Đặt giới hạn kích thước yêu cầu, số khoản chi và số thành viên trước khi tính.
2. Đọc một phiên bản nhất quán của sổ. Tính số dư từ các khoản chi và các giao dịch
   đã xác nhận. Chạy tối ưu trên máy chủ hoặc worker để tránh chặn giao diện.
3. Trả phương án cùng phiên bản sổ. Khi sổ thay đổi, tính lại; không coi phương án
   gợi ý là giao dịch thực tế và không tự đánh dấu đã thanh toán.
4. Lưu mỗi lần chuyển với ID duy nhất và trạng thái `pending`, `confirmed` hoặc
   `rejected`. Chỉ `confirmed` ảnh hưởng số dư. Chống gửi lặp bằng ràng buộc duy
   nhất trong cơ sở dữ liệu và cập nhật trạng thái trong một giao dịch nguyên tử.
5. Hiển thị riêng khoản đang chờ xác nhận, tránh gợi ý người dùng trả trùng trong
   lúc chờ. Module hiện không giữ chỗ số tiền của khoản chờ; phần giao diện/API
   cần xử lý việc này khi tích hợp.
6. Việc xác nhận phải do người có quyền thực hiện. Module chỉ đọc trạng thái
   được cung cấp; nó không xác minh tiền đã vào ngân hàng.

Gọi lại hàm trên cùng bản sổ không cộng giao dịch hai lần. ID trùng trong dữ liệu
đầu vào bị từ chối. Đây không thay thế cơ chế chống lặp ở cơ sở dữ liệu. Hoàn tiền
một phần làm giảm số dư tương ứng; nếu đã xác nhận trả thừa, sổ phản ánh thành số
dư ngược chiều và lần tối ưu tiếp theo đề xuất hoàn phần thừa.

## 8. Kiểm thử và đo hiệu năng

```text
npm test
npm run demo
npm run benchmark
```

Kiểm thử bao gồm chia đồng lẻ, trọng số lớn, người thanh toán không tham gia,
nhiều người cùng thanh toán, nhóm tham gia riêng từng khoản, hoàn trả, số nguyên giới hạn, dữ liệu
không hợp lệ, thứ tự ổn định, nhóm 20 người, và 300 bộ dữ liệu ngẫu nhiên đối chiếu
với một phép tìm kiếm toàn bộ độc lập.

Ngày 25/09/2026: **22/22 kiểm thử đạt** qua `npm test`, bao gồm luồng nhóm 20 người
từ khoản chi đến hoàn trả hết nợ, trả từng phần và trả thừa. Ngày 26/09 bổ sung kiểm
thử tái hiện hai trạng thái quan sát trực tiếp trên website (trước/sau hoàn trả mẫu).
Sau bước đó, `npm test` đạt **23/23 kiểm thử**. Cũng ngày 26/09, bổ sung hai chế độ,
ghép cặp và chứng nhận cận dưới: bộ hiện tại đạt **38/38 kiểm thử**, gồm 15 kiểm thử
mới và tổng cộng 600 bộ số dư nhỏ đối chiếu với phép tìm kiếm độc lập.

Đo sau khi thêm ghép cặp ngày 26/09/2026, Node 22.15.1, Windows, Intel i5-1135G7.
Mỗi trường hợp chạy làm nóng một lần, đo chín lần; ghi trung vị:

| Dữ liệu | Heap thuần: lượt | Ít lượt nhất: lượt / thời gian | Gom qua người đầu: lượt / thời gian |
|---|---:|---:|---:|
| Phản ví dụ 6 người | 5 | 4 / 0,024 ms | 5 / 0,007 ms |
| 20 người đều có khoản chi, tổng 10 triệu | 12 | 11 / 0,029 ms | 19 / 0,013 ms |
| 20 số dư ngẫu nhiên với hạt giống cố định | 19 | 19 / 23,990 ms | 19 / 0,013 ms |
| 200 người ghép thành 100 cặp đối nhau | 100 | 100 / 0,135 ms | 199 / 0,079 ms |

Đây là số đo của module cục bộ với dữ liệu mẫu; không phải tốc độ của website
tham khảo, không bao gồm mạng/cơ sở dữ liệu và không phải cam kết hiệu năng máy
chủ. Dữ liệu có nhiều cặp đối nhau được rút gọn rất nhanh; trường hợp ngẫu nhiên
20 người vẫn có thể cần DP đầy đủ. Không suy ra tốc độ mọi dữ liệu từ một mẫu.
