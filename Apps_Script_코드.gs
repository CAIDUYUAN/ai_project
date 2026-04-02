// ============================================================
// 빨간집 대시보드 · Apps Script
// ============================================================

// ── 메인: 드라이브 폴더 파일 읽기 ──
function doGet(e) {
  try {
    const folderId = e.parameter.folderId || '1hBWfvM9EEvZQiBUcA4ZPoBZfjQEvpsq5';
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const result = [];
    const skipped = [];
    const errors = [];

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      const mime = file.getMimeType();
      const id   = file.getId();
      const meta = parseFileMeta(name);

      try {
        let content = '';

        // CSV / TXT
        if (name.match(/\.(csv|txt)$/i)) {
          try { content = file.getBlob().getDataAsString('UTF-8'); }
          catch(e1) { content = file.getBlob().getDataAsString('EUC-KR'); }

        // 구글 스프레드시트
        } else if (mime === 'application/vnd.google-apps.spreadsheet') {
          const ss = SpreadsheetApp.openById(id);
          let combined = '';
          ss.getSheets().forEach(function(sheet) {
            try {
              const data = sheet.getDataRange().getValues();
              if (!data || data.length === 0) return;
              combined += '=== ' + sheet.getName() + ' ===\n';
              combined += data.map(function(row) {
                return row.map(function(cell) {
                  if (cell instanceof Date)
                    return Utilities.formatDate(cell, 'Asia/Seoul', 'yyyy-MM-dd');
                  const v = (cell === null || cell === undefined) ? '' : String(cell);
                  return v.indexOf(',') >= 0 ? '"' + v.replace(/"/g,'""') + '"' : v;
                }).join(',');
              }).join('\n') + '\n\n';
            } catch(se) {}
          });
          content = combined;

        // Excel → 안내
        } else if (name.match(/\.(xlsx|xls)$/i)) {
          errors.push({
            name: name,
            error: '⚠️ Excel 파일은 구글 시트로 변환 필요: 파일 우클릭 → 연결앱 → Google 스프레드시트로 저장'
          });
          continue;

        } else {
          skipped.push(name);
          continue;
        }

        if (content && content.trim()) {
          result.push({
            name: name, content: content,
            platform: meta.platform, year: meta.year,
            month: meta.month, dateLabel: meta.dateLabel, type: meta.type
          });
        }

      } catch(fileErr) {
        errors.push({ name: name, error: fileErr.toString() });
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true, files: result, count: result.length,
        skipped: skipped, errors: errors
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ============================================================
// 중복 파일 삭제
// 기준: 파일명 + MIME 타입 + 파일 크기 가 모두 같으면 중복
// 가장 오래된 파일(createdDate 기준)을 남기고 나머지 삭제
// ============================================================
function removeDuplicates() {
  const folderId = '1hBWfvM9EEvZQiBUcA4ZPoBZfjQEvpsq5';
  const folder   = DriveApp.getFolderById(folderId);
  const files    = folder.getFiles();

  // 파일 목록 수집
  const fileList = [];
  while (files.hasNext()) {
    const f = files.next();
    fileList.push({
      id:      f.getId(),
      name:    f.getName(),
      mime:    f.getMimeType(),
      size:    f.getSize(),
      created: f.getDateCreated().getTime(),
      file:    f
    });
  }

  // 중복 그룹화 (키: 파일명|MIME|크기)
  const groups = {};
  fileList.forEach(function(f) {
    // 확장자 제거한 파일명으로만 중복 판단 (구글시트 vs xlsx 동일 취급)
    const baseName = f.name.replace(/\.(xlsx|xls|csv|txt)$/i, '').trim();
    const key = baseName;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });

  let deleted = 0;
  const log   = [];

  Object.keys(groups).forEach(function(key) {
    const group = groups[key];
    if (group.length <= 1) return; // 중복 없음

    // 구글 시트 우선 남기기 → 그 다음 오래된 파일 순
    group.sort(function(a, b) {
      const aIsSheet = a.mime === 'application/vnd.google-apps.spreadsheet' ? 0 : 1;
      const bIsSheet = b.mime === 'application/vnd.google-apps.spreadsheet' ? 0 : 1;
      if (aIsSheet !== bIsSheet) return aIsSheet - bIsSheet;
      return a.created - b.created;
    });
    const keep    = group[0];
    const toTrash = group.slice(1);

    log.push('✅ 유지: ' + keep.name + ' (생성: ' + new Date(keep.created).toLocaleString('ko-KR') + ')');

    toTrash.forEach(function(f) {
      try {
        f.file.setTrashed(true); // 휴지통으로 이동 (완전 삭제 아님)
        deleted++;
        log.push('  🗑 삭제: ' + f.name + ' (생성: ' + new Date(f.created).toLocaleString('ko-KR') + ')');
      } catch(e) {
        log.push('  ❌ 실패: ' + f.name + ' / ' + e.toString());
      }
    });
  });

  // 결과 출력
  Logger.log('========================================');
  Logger.log('중복 파일 삭제 완료: ' + deleted + '개 삭제');
  Logger.log('========================================');
  log.forEach(function(l) { Logger.log(l); });

  if (deleted === 0) {
    Logger.log('중복 파일이 없습니다 ✨');
  }
}


// ============================================================
// Excel → 구글 시트 일괄 변환
// ============================================================
function convertAllExcelToSheets() {
  const folderId = '1hBWfvM9EEvZQiBUcA4ZPoBZfjQEvpsq5';
  const folder   = DriveApp.getFolderById(folderId);
  const files    = folder.getFiles();
  let converted  = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    const mime = file.getMimeType();

    if (name.match(/\.(xlsx|xls)$/i) ||
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/vnd.ms-excel') {

      const blob = file.getBlob()
        .setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const newFile = Drive.Files.insert(
        {
          title: name.replace(/\.(xlsx|xls)$/i, ''),
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [{ id: folderId }]
        },
        blob,
        { convert: true }
      );
      Logger.log('변환 완료: ' + name + ' → ' + newFile.title);
      converted++;
    }
  }
  Logger.log('전체 변환 완료! (' + converted + '개)');
}


// ============================================================
// 권한 승인 (최초 1회 실행)
// ============================================================
function authorizeAll() {
  const folder = DriveApp.getFolderById('1hBWfvM9EEvZQiBUcA4ZPoBZfjQEvpsq5');
  Logger.log('Drive OK: ' + folder.getName());
  const resp = UrlFetchApp.fetch('https://www.google.com', {muteHttpExceptions:true});
  Logger.log('UrlFetch OK: ' + resp.getResponseCode());
  Logger.log('Sheets OK');
}


// ============================================================
// 파일명에서 플랫폼/날짜 메타 파싱
// ============================================================
function parseFileMeta(name) {
  const meta = { platform:'기타', year:null, month:[], dateLabel:'', type:'unknown' };

  if (/coupang[_\-]eats/i.test(name)) {
    meta.platform = '쿠팡이츠';
    const m = name.match(/(\d{4})-(\d{2})/);
    if (m) { meta.year=parseInt(m[1]); meta.month=[parseInt(m[2])]; meta.dateLabel=m[1]+'년 '+m[2]+'월'; }

  } else if (/매출상세내역/.test(name)) {
    meta.platform = '배달의민족';
    const m = name.match(/(\d{4})년(\d{2})월/);
    if (m) { meta.year=parseInt(m[1]); meta.month=[parseInt(m[2])]; meta.dateLabel=m[1]+'년 '+m[2]+'월'; }

  } else if (/매출내역/.test(name) && /^\d{6}_\d{6}/.test(name)) {
    meta.platform = '땡겨요';
    const m = name.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    if (m) {
      const sy=2000+parseInt(m[1]), sm=parseInt(m[2]);
      const ey=2000+parseInt(m[4]), em=parseInt(m[5]);
      meta.year = sy;
      const months=[]; let y=sy, mo=sm;
      while(y<ey||(y===ey&&mo<=em)){ months.push(mo); mo++; if(mo>12){mo=1;y++;} }
      meta.month=months;
      meta.dateLabel=sy+'년'+sm+'월~'+ey+'년'+em+'월';
    }

  } else if (/yogiyo|요기요/i.test(name)) {
    meta.platform = '요기요';
    const m = name.match(/(\d{4})[.\-_]?(\d{2})/);
    if (m) { meta.year=parseInt(m[1]); meta.month=[parseInt(m[2])]; meta.dateLabel=m[1]+'년 '+m[2]+'월'; }

  } else if (/doeat|두잇/i.test(name)) {
    meta.platform = '두잇';
    const m = name.match(/(\d{4})[.\-_]?(\d{2})/);
    if (m) { meta.year=parseInt(m[1]); meta.month=[parseInt(m[2])]; meta.dateLabel=m[1]+'년 '+m[2]+'월'; }
  }

  if (/\.csv$/i.test(name))        meta.type = 'csv';
  else if (/\.(xlsx|xls)$/i.test(name)) meta.type = 'excel';
  else if (/\.txt$/i.test(name))   meta.type = 'txt';
  else                              meta.type = 'gsheet';

  return meta;
}
