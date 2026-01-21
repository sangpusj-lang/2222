(() => {
  const fileInput = document.getElementById("image-input");
  const dropZone = document.getElementById("drop-zone");
  const previewList = document.getElementById("preview-list");
  const clearBtn = document.getElementById("clear-btn");
  const downloadBtn = document.getElementById("download-btn");

  /** @type {File[]} */
  let imageFiles = [];
  let toastTimer = null;

  function showToast(message, isError = false) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.innerHTML = `<span class="toast-dot"></span><span>${message}</span>`;
    document.body.appendChild(el);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.remove();
    }, 2600);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + " KB";
    const mb = kb / 1024;
    return mb.toFixed(2) + " MB";
  }

  function renderPreview() {
    previewList.innerHTML = "";

    if (!imageFiles.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "placeholder";
      placeholder.textContent = "还没有选择图片";
      previewList.appendChild(placeholder);
      downloadBtn.disabled = true;
      return;
    }

    imageFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "preview-item";

      const img = document.createElement("img");
      img.className = "preview-thumb";
      img.draggable = false;
      img.src = URL.createObjectURL(file);
      img.alt = file.name;

      const meta = document.createElement("div");
      meta.className = "preview-meta";

      const name = document.createElement("div");
      name.className = "preview-name";
      name.textContent = file.name;

      const size = document.createElement("div");
      size.className = "preview-size";
      size.textContent = formatSize(file.size);

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.innerHTML = `<span class="badge-dot"></span><span>将导出到 PDF</span>`;

      meta.appendChild(name);
      meta.appendChild(size);
      meta.appendChild(badge);

      const indexTag = document.createElement("div");
      indexTag.className = "preview-index";
      indexTag.textContent = index + 1;

      item.appendChild(img);
      item.appendChild(meta);
      item.appendChild(indexTag);

      previewList.appendChild(item);
    });

    downloadBtn.disabled = false;
  }

  function handleFiles(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      showToast("请选择图片文件", true);
      return;
    }
    imageFiles = imageFiles.concat(list);
    renderPreview();
    showToast(`已选择 ${imageFiles.length} 张图片`);
  }

  // 选择文件（点击 label 自带触发，无需额外 click 事件）
  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });

  // 拖拽
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    handleFiles(e.dataTransfer.files);
  });

  // 清空
  clearBtn.addEventListener("click", () => {
    if (!imageFiles.length) return;
    imageFiles = [];
    renderPreview();
    showToast("已清空所有图片");
  });

  async function generatePdf() {
    if (!imageFiles.length) {
      showToast("请先选择图片", true);
      return;
    }

    downloadBtn.disabled = true;
    showToast("正在生成 PDF，请稍候…");

    try {
      const jspdfGlobal = window.jspdf;
      if (!jspdfGlobal || !jspdfGlobal.jsPDF) {
        showToast("PDF 库加载失败，请检查网络或稍后重试", true);
        console.error("jsPDF 未正确加载：window.jspdf 为", window.jspdf);
        downloadBtn.disabled = false;
        return;
      }

      const { jsPDF } = jspdfGlobal;

      // 第 1 张图片：以图片原始像素尺寸作为 PDF 页面尺寸，做到「无白边」
      const firstFile = imageFiles[0];
      const firstImgData = await fileToDataURL(firstFile);
      const firstSize = await measureImage(firstImgData);

      // 以 px 作为单位，PDF 页面大小 = 图片原始大小
      const pdf = new jsPDF({
        unit: "px",
        format: [firstSize.width, firstSize.height],
        compress: true,
      });

      // 把图片从左上角开始铺满整页（不缩放不留边）
      const addFilledImage = (doc, imgData, file, width, height, isFirst) => {
        if (!isFirst) {
          // 新页面的尺寸同样设置为当前图片的尺寸
          doc.addPage([width, height]);
        }
        const type = (file.type || "").toLowerCase();
        const imgType = type.includes("png")
          ? "PNG"
          : type.includes("webp")
          ? "WEBP"
          : "JPEG";
        doc.addImage(imgData, imgType, 0, 0, width, height);
      };

      // 第一张
      addFilledImage(pdf, firstImgData, firstFile, firstSize.width, firstSize.height, true);

      // 后续每一张都使用自己的尺寸作为页面尺寸，同样铺满
      for (let i = 1; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const imgData = await fileToDataURL(file);
        const size = await measureImage(imgData);
        addFilledImage(pdf, imgData, file, size.width, size.height, false);
      }

      const name = `合并图片_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.pdf`;
      pdf.save(name);
      showToast("PDF 已生成并开始下载");
    } catch (err) {
      console.error(err);
      showToast("生成 PDF 失败，请重试", true);
    } finally {
      downloadBtn.disabled = false;
    }
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function measureImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = src;
    });
  }

  downloadBtn.addEventListener("click", () => {
    generatePdf();
  });

  // 初始化
  renderPreview();
})();


