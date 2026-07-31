# Ad-hoc script: updates all src/nodes/*.ts files to reference i18n.nodes.__shared.pin_xxx
# for the 25 pin_ keys that were merged into nodes.__shared.

$files = Get-ChildItem "src/nodes/*.ts"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw

    # Replace all 3-part paths: i18n.nodes.CATEGORY.SUBCATEGORY.pin_SHARED
    # Pattern captures the shared key name in group 3 so we can rebuild the __shared path.
    $sharedKeys = 'result|success|error|completed|a|b|value|status|auth|loop_body|index|timeout|delimiter|plaintext|private_key|auto_detect|start|end|length|removed|item|contains|xml|json|csv'
    $content = $content -replace "i18n\.nodes\.[^.\s]+\.[^.\s]+\.pin_($sharedKeys)\b", 'i18n.nodes.__shared.pin_$1'

    # Replace 2-part top-level keys that qualified for sharing:
    #   math.pin_a / pin_b / pin_result   (top-level math section)
    #   array.pin_index                    (top-level array section)
    #   map.pin_value                      (top-level map section)
    $content = $content -replace 'i18n\.nodes\.math\.pin_(a|b|result)\b', 'i18n.nodes.__shared.pin_$1'
    $content = $content -replace 'i18n\.nodes\.array\.pin_index\b', 'i18n.nodes.__shared.pin_index'
    $content = $content -replace 'i18n\.nodes\.map\.pin_value\b', 'i18n.nodes.__shared.pin_value'

    Set-Content $file.FullName $content -NoNewline
}

Write-Host "src/nodes/*.ts updated."
