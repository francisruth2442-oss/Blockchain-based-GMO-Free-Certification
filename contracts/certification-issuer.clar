(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-FARM-ID u101)
(define-constant ERR-INVALID-PRODUCT-ID u102)
(define-constant ERR-INVALID-TEST-ID u103)
(define-constant ERR-TEST-NOT-APPROVED u104)
(define-constant ERR-CERT-ALREADY-EXISTS u105)
(define-constant ERR-CERT-NOT-FOUND u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-AUDITOR-NOT-VERIFIED u109)
(define-constant ERR-INVALID-METADATA u110)

(define-data-var cert-counter uint u0)
(define-data-var authority-contract (optional principal) none)

(define-map certifications 
  { cert-id: uint } 
  { 
    farm-id: uint, 
    product-id: uint, 
    test-id: uint, 
    status: (string-ascii 20), 
    issue-time: uint,
    metadata: (string-utf8 500)
  })

(define-map cert-audits
  { cert-id: uint }
  { 
    auditor: principal, 
    audit-time: uint, 
    notes: (string-utf8 200)
  })

(define-read-only (get-certification (cert-id uint))
  (map-get? certifications { cert-id: cert-id })
)

(define-read-only (get-cert-audit (cert-id uint))
  (map-get? cert-audits { cert-id: cert-id })
)

(define-read-only (get-cert-counter)
  (ok (var-get cert-counter))
)

(define-private (validate-farm-id (farm-id uint))
  (if (> farm-id u0)
      (ok true)
      (err ERR-INVALID-FARM-ID))
)

(define-private (validate-product-id (product-id uint))
  (if (> product-id u0)
      (ok true)
      (err ERR-INVALID-PRODUCT-ID))
)

(define-private (validate-test-id (test-id uint))
  (if (> test-id u0)
      (ok true)
      (err ERR-INVALID-TEST-ID))
)

(define-private (validate-status (status (string-ascii 20)))
  (if (or (is-eq status "active") (is-eq status "revoked") (is-eq status "pending"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-metadata (metadata (string-utf8 500)))
  (if (<= (len metadata) u500)
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (is-auditor-verified (auditor principal))
  (if (not (is-eq auditor 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-AUDITOR-NOT-VERIFIED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (issue-certification 
  (farm-id uint) 
  (product-id uint) 
  (test-id uint) 
  (metadata (string-utf8 500))
)
  (let ((cert-id (+ (var-get cert-counter) u1)))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-farm-id farm-id))
    (try! (validate-product-id product-id))
    (try! (validate-test-id test-id))
    (try! (validate-metadata metadata))
    (asserts! (is-none (map-get? certifications { cert-id: cert-id })) (err ERR-CERT-ALREADY-EXISTS))
    (map-set certifications 
      { cert-id: cert-id }
      { 
        farm-id: farm-id, 
        product-id: product-id, 
        test-id: test-id, 
        status: "pending", 
        issue-time: block-height,
        metadata: metadata
      })
    (var-set cert-counter cert-id)
    (print { event: "cert-issued", cert-id: cert-id })
    (ok cert-id)
  )
)

(define-public (approve-certification 
  (cert-id uint) 
  (notes (string-utf8 200))
)
  (let ((cert (map-get? certifications { cert-id: cert-id })))
    (match cert
      cert-details
        (begin
          (try! (is-auditor-verified tx-sender))
          (asserts! (is-eq (get status cert-details) "pending") (err ERR-INVALID-STATUS))
          (map-set certifications 
            { cert-id: cert-id }
            (merge cert-details { status: "active", issue-time: block-height }))
          (map-set cert-audits 
            { cert-id: cert-id }
            { auditor: tx-sender, audit-time: block-height, notes: notes })
          (print { event: "cert-approved", cert-id: cert-id })
          (ok true)
        )
      (err ERR-CERT-NOT-FOUND)
    )
  )
)

(define-public (revoke-certification 
  (cert-id uint) 
  (notes (string-utf8 200))
)
  (let ((cert (map-get? certifications { cert-id: cert-id })))
    (match cert
      cert-details
        (begin
          (try! (is-auditor-verified tx-sender))
          (asserts! (is-eq (get status cert-details) "active") (err ERR-INVALID-STATUS))
          (map-set certifications 
            { cert-id: cert-id }
            (merge cert-details { status: "revoked", issue-time: block-height }))
          (map-set cert-audits 
            { cert-id: cert-id }
            { auditor: tx-sender, audit-time: block-height, notes: notes })
          (print { event: "cert-revoked", cert-id: cert-id })
          (ok true)
        )
      (err ERR-CERT-NOT-FOUND)
    )
  )
)