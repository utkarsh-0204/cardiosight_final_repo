import Foundation
import PDFKit
import Vision

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: pdf_ocr <pdf-file-path>\n", stderr)
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: pdfPath)
guard let doc = PDFDocument(url: url) else {
    fputs("Failed to open PDF document\n", stderr)
    exit(1)
}

var allText: [String] = []

for pageIndex in 0..<doc.pageCount {
    guard let page = doc.page(at: pageIndex) else { continue }
    
    // Add page delimiter
    allText.append("\n-- \(pageIndex + 1) of \(doc.pageCount) --\n")
    
    let pageBounds = page.bounds(for: .mediaBox)
    let renderer = ImageRenderer(page: page, bounds: pageBounds)
    guard let cgImage = renderer.render() else { continue }
    
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
        if let results = request.results {
            for obs in results {
                if let candidate = obs.topCandidates(1).first {
                    allText.append(candidate.string)
                }
            }
        }
    } catch {
        fputs("OCR error on page \(pageIndex): \(error)\n", stderr)
    }
}

print(allText.joined(separator: "\n"))

class ImageRenderer {
    let page: PDFPage
    let bounds: CGRect
    
    init(page: PDFPage, bounds: CGRect) {
        self.page = page
        self.bounds = bounds
    }
    
    func render() -> CGImage? {
        let scale: CGFloat = 2.0 // 2x resolution for crisp OCR
        let width = Int(bounds.width * scale)
        let height = Int(bounds.height * scale)
        guard width > 0, height > 0 else { return nil }
        
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: nil,
                                  width: width,
                                  height: height,
                                  bitsPerComponent: 8,
                                  bytesPerRow: 0,
                                  space: colorSpace,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
            return nil
        }
        
        ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        
        ctx.saveGState()
        ctx.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: ctx)
        ctx.restoreGState()
        
        return ctx.makeImage()
    }
}
