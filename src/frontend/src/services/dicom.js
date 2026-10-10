import dicomParser from "dicom-parser";

// Transfer syntaxes with raw pixel data -> byte order of the pixel values
const UNCOMPRESSED = {
  "1.2.840.10008.1.2": "little", // Implicit VR Little Endian
  "1.2.840.10008.1.2.1": "little", // Explicit VR Little Endian
  "1.2.840.10008.1.2.2": "big", // Explicit VR Big Endian
};

// The browser decodes these itself: each frame is a regular JPEG
const JPEG_BASELINE = ["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"];

const COMPRESSION_NAMES = {
  "1.2.840.10008.1.2.4.57": "JPEG Lossless",
  "1.2.840.10008.1.2.4.70": "JPEG Lossless",
  "1.2.840.10008.1.2.4.80": "JPEG-LS",
  "1.2.840.10008.1.2.4.81": "JPEG-LS",
  "1.2.840.10008.1.2.4.90": "JPEG 2000",
  "1.2.840.10008.1.2.4.91": "JPEG 2000",
  "1.2.840.10008.1.2.5": "RLE",
};

/**
 * Converts the first frame of a DICOM file to a JPEG for the AI services.
 * Applies the DICOM display settings (rescale, window, MONOCHROME1 inversion)
 * so the image looks the way a DICOM viewer would show it.
 */
export async function dicomToJpeg(file) {
  const dataSet = dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()));
  const transferSyntax = dataSet.string("x00020010") || "1.2.840.10008.1.2";
  const pixelDataElement = dataSet.elements.x7fe00010;
  if (!pixelDataElement) {
    throw new Error("This DICOM file contains no image.");
  }

  const rows = dataSet.uint16("x00280010");
  const columns = dataSet.uint16("x00280011");
  const photometric = (dataSet.string("x00280004") || "MONOCHROME2").trim();
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");

  if (JPEG_BASELINE.includes(transferSyntax)) {
    const frame = firstEncapsulatedFrame(dataSet, pixelDataElement);
    const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
    context.drawImage(bitmap, 0, 0, columns, rows);
    if (photometric === "MONOCHROME1") {
      invert(context, columns, rows);
    }
  } else if (UNCOMPRESSED[transferSyntax]) {
    if ((dataSet.uint16("x00280002") || 1) !== 1) {
      throw new Error("Color DICOM images aren't supported. Please upload a PNG or JPG instead.");
    }
    const values = readGrayscale(
      dataSet,
      pixelDataElement,
      rows * columns,
      UNCOMPRESSED[transferSyntax] === "little"
    );
    drawGrayscale(context, dataSet, values, photometric, columns, rows);
  } else {
    const compression = COMPRESSION_NAMES[transferSyntax] || `transfer syntax ${transferSyntax}`;
    throw new Error(
      `This DICOM is compressed with ${compression}, which can't be converted in the browser yet. ` +
        "Please upload an uncompressed DICOM, or a PNG/JPG export."
    );
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  return new File([blob], file.name.replace(/\.dcm$/i, ".jpg"), { type: "image/jpeg" });
}

function firstEncapsulatedFrame(dataSet, pixelDataElement) {
  if ((dataSet.intString("x00280008") || 1) === 1) {
    return dicomParser.readEncapsulatedPixelDataFromFragments(
      dataSet,
      pixelDataElement,
      0,
      pixelDataElement.fragments.length
    );
  }
  const offsets = pixelDataElement.basicOffsetTable.length
    ? pixelDataElement.basicOffsetTable
    : dicomParser.createJPEGBasicOffsetTable(dataSet, pixelDataElement);
  return dicomParser.readEncapsulatedImageFrame(dataSet, pixelDataElement, 0, offsets);
}

function readGrayscale(dataSet, pixelDataElement, count, littleEndian) {
  const bitsAllocated = dataSet.uint16("x00280100");
  if (bitsAllocated !== 8 && bitsAllocated !== 16) {
    throw new Error(`${bitsAllocated}-bit DICOM images aren't supported.`);
  }
  const bytesPerPixel = bitsAllocated / 8;
  if (pixelDataElement.length < count * bytesPerPixel) {
    throw new Error("The image data in this DICOM file is incomplete.");
  }
  const bitsStored = dataSet.uint16("x00280101") || bitsAllocated;
  const signed = dataSet.uint16("x00280103") === 1;
  // bits above BitsStored can hold overlays or garbage in older files
  const mask = 2 ** bitsStored - 1;
  const view = new DataView(
    dataSet.byteArray.buffer,
    dataSet.byteArray.byteOffset + pixelDataElement.dataOffset,
    count * bytesPerPixel
  );

  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let value =
      bytesPerPixel === 2 ? view.getUint16(i * 2, littleEndian) & mask : view.getUint8(i) & mask;
    if (signed && value > mask >> 1) {
      value -= mask + 1;
    }
    values[i] = value;
  }
  return values;
}

function drawGrayscale(context, dataSet, values, photometric, columns, rows) {
  const slope = dataSet.floatString("x00281053") || 1;
  const intercept = dataSet.floatString("x00281052") || 0;
  for (let i = 0; i < values.length; i++) {
    values[i] = values[i] * slope + intercept;
  }

  const [low, high] = displayRange(dataSet, values);
  const invertValues = photometric === "MONOCHROME1";
  const image = context.createImageData(columns, rows);
  for (let i = 0; i < values.length; i++) {
    let value = Math.round(((values[i] - low) / (high - low)) * 255);
    value = Math.max(0, Math.min(255, value));
    if (invertValues) {
      value = 255 - value;
    }
    const j = i * 4;
    image.data[j] = value;
    image.data[j + 1] = value;
    image.data[j + 2] = value;
    image.data[j + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

// The window stored in the file, or else the 0.5th-99.5th percentile of the
// pixel values, so a few extreme pixels (markers, padding) don't wash out the image
function displayRange(dataSet, values) {
  const center = dataSet.floatString("x00281050", 0);
  const width = dataSet.floatString("x00281051", 0);
  if (Number.isFinite(center) && width > 1) {
    return [center - width / 2, center + width / 2];
  }
  const isPlain8Bit =
    dataSet.uint16("x00280100") === 8 &&
    dataSet.uint16("x00280103") !== 1 &&
    !dataSet.elements.x00281053 &&
    !dataSet.elements.x00281052;
  if (isPlain8Bit) {
    return [0, 255];
  }

  const sample = [];
  for (let i = 0; i < values.length; i += 16) {
    sample.push(values[i]);
  }
  sample.sort((a, b) => a - b);
  const low = sample[Math.floor(sample.length * 0.005)];
  const high = sample[Math.ceil(sample.length * 0.995) - 1];
  return high > low ? [low, high] : [low, low + 1];
}

function invert(context, columns, rows) {
  const image = context.getImageData(0, 0, columns, rows);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 255 - image.data[i];
    image.data[i + 1] = 255 - image.data[i + 1];
    image.data[i + 2] = 255 - image.data[i + 2];
  }
  context.putImageData(image, 0, 0);
}
