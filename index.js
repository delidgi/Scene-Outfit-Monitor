import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const extensionName = 'scene-outfit-monitor';

const defaultSettings = {
    isEnabled: true,
    scene: {
        location: 'Неизвестно',
        userPosition: 'Неизвестно',
        charPosition: 'Неизвестно'
    },
    outfit: {
        outerWear: '',
        top: '',
        bottom: '',
        dress: '',
        underwear: '',
        accessories: '',
        shoes: '',
        features: ''
    }
};

function getSettings() {
    return extension_settings[extensionName];
}

// ============================================
// ПАРСИНГ AI СООБЩЕНИЙ
// ============================================

function parseAIMessage(text) {
    const s = getSettings();
    let updated = false;

    // Парсинг локации
    const locationPatterns = [
        /(?:вошл[аи]|зашл[аи]|пришл[аи]|оказал[аи]сь|нахо[дж](?:и[тл]ся|усь)) (?:в|на) ([^.!?,]{3,30})/gi,
        /(?:в|на) ([а-яё]{4,20}(?:ой|ей|е|и|ой комнате|ем))/gi
    ];

    for (const pattern of locationPatterns) {
        const match = text.match(pattern);
        if (match) {
            let loc = match[0].replace(/вошл[аи]|зашл[аи]|пришл[аи]|в |на /gi, '').trim();
            loc = loc.charAt(0).toUpperCase() + loc.slice(1);
            if (loc.length > 3 && loc.length < 30) {
                s.scene.location = loc;
                updated = true;
                console.log('[SceneOutfit] Локация:', loc);
                break;
            }
        }
    }

    // Парсинг позиции {{user}}
    const userPosPatterns = [
        /(?:сел[аи]|лег[ли]а|встал[аи]|подошл[аи]|присел[аи]) (?:на|в|к|у) ([^.!?,]{3,30})/gi,
        /(?:на|в|у) ([а-яё]{4,20}(?:е|и|у|ом|ой))/gi
    ];

    for (const pattern of userPosPatterns) {
        const match = text.match(pattern);
        if (match) {
            let pos = match[0].replace(/сел[аи]|лег[ли]а|встал[аи]|подошл[аи]|присел[аи]/gi, '').trim();
            pos = pos.charAt(0).toUpperCase() + pos.slice(1);
            if (pos.length > 2 && pos.length < 30) {
                s.scene.userPosition = pos;
                updated = true;
                console.log('[SceneOutfit] {{user}} позиция:', pos);
                break;
            }
        }
    }

    // Парсинг позиции {{char}}
    const charName = window.name2 || '{{char}}';
    const charPosPattern = new RegExp(`${charName}.*?(?:сто[ия]т|сидит|лежит|подош[её]л) (?:у|на|в|к) ([^.!?,]{3,30})`, 'gi');
    const charMatch = text.match(charPosPattern);
    if (charMatch) {
        let pos = charMatch[0].replace(new RegExp(charName, 'gi'), '').replace(/сто[ия]т|сидит|лежит|подош[её]л/gi, '').trim();
        pos = pos.charAt(0).toUpperCase() + pos.slice(1);
        if (pos.length > 2 && pos.length < 30) {
            s.scene.charPosition = pos;
            updated = true;
            console.log('[SceneOutfit] {{char}} позиция:', pos);
        }
    }

    // Парсинг одежды - СНЯТИЕ
    if (/(сняла?|снял|разделась|разделся|скинула?)/gi.test(text)) {
        if (/куртк|пальто|плащ|пиджак/gi.test(text)) {
            s.outfit.outerWear = '';
            updated = true;
            console.log('[SceneOutfit] Снята верхняя одежда');
        }
        if (/футболк|рубашк|свитер|майк|топ|блузк/gi.test(text)) {
            s.outfit.top = '';
            updated = true;
            console.log('[SceneOutfit] Снят верх');
        }
        if (/джинс|штан|брюк|шорт|юбк/gi.test(text)) {
            s.outfit.bottom = '';
            updated = true;
            console.log('[SceneOutfit] Снят низ');
        }
        if (/платье|сарафан|комбинезон/gi.test(text)) {
            s.outfit.dress = '';
            updated = true;
            console.log('[SceneOutfit] Снято платье');
        }
        if (/трус|белье|лифчик|бюстгальтер/gi.test(text)) {
            s.outfit.underwear = '';
            updated = true;
            console.log('[SceneOutfit] Снято бельё');
        }
        if (/туфл|ботинк|кроссовк|сапог|обувь/gi.test(text)) {
            s.outfit.shoes = '';
            updated = true;
            console.log('[SceneOutfit] Снята обувь');
        }
        if (/босиком|босая|разулась/gi.test(text)) {
            s.outfit.shoes = 'Босиком';
            updated = true;
            console.log('[SceneOutfit] Босиком');
        }
    }

    // Парсинг одежды - НАДЕВАНИЕ
    if (/(надел[аи]|одел[аи]|облачилась)/gi.test(text)) {
        const dressMatch = text.match(/(?:надел[аи]|одел[аи]) ([^.!?,]*(?:платье|сарафан|комбинезон)[^.!?,]*)/gi);
        if (dressMatch) {
            s.outfit.dress = dressMatch[0].replace(/надел[аи]|одел[аи]/gi, '').trim();
            s.outfit.top = '';
            s.outfit.bottom = '';
            updated = true;
            console.log('[SceneOutfit] Надето платье:', s.outfit.dress);
        }
    }

    // Полное раздевание
    if (/(полностью разделась|полностью раздет[аы]й|голая|голый|нагая)/gi.test(text)) {
        s.outfit.outerWear = '';
        s.outfit.top = '';
        s.outfit.bottom = '';
        s.outfit.dress = '';
        s.outfit.underwear = '';
        s.outfit.shoes = 'Босиком';
        updated = true;
        console.log('[SceneOutfit] Полное раздевание');
    }

    // Особенности
    if (/мокр[аы][яеи]* волос/gi.test(text)) {
        s.outfit.features = 'Мокрые волосы';
        updated = true;
    }

    if (updated) {
        saveSettingsDebounced();
        syncUI();
        updatePromptInjection();
    }

    return updated;
}

// ============================================
// ПРОМПТ-ИНЖЕКТ
// ============================================

function updatePromptInjection() {
    const s = getSettings();

    if (!s.isEnabled) {
        setExtensionPrompt(extensionName, '', extension_prompt_types.IN_CHAT, 0);
        return;
    }

    let prompt = `\n\n[OOC: 📍 ТЕКУЩАЯ СЦЕНА\n`;
    prompt += `Локация: ${s.scene.location}\n`;
    prompt += `🧍 {{user}}: ${s.scene.userPosition}\n`;
    prompt += `🎭 {{char}}: ${s.scene.charPosition}\n\n`;

    // Аутфит
    const outfit = [];
    if (s.outfit.outerWear) outfit.push(`Верхняя одежда: ${s.outfit.outerWear}`);
    if (s.outfit.dress) {
        outfit.push(`Платье: ${s.outfit.dress}`);
    } else {
        if (s.outfit.top) outfit.push(`Верх: ${s.outfit.top}`);
        if (s.outfit.bottom) outfit.push(`Низ: ${s.outfit.bottom}`);
    }
    if (s.outfit.underwear) outfit.push(`Бельё: ${s.outfit.underwear}`);
    if (s.outfit.accessories) outfit.push(`Аксессуары: ${s.outfit.accessories}`);
    if (s.outfit.shoes) outfit.push(`Обувь: ${s.outfit.shoes}`);
    if (s.outfit.features) outfit.push(`Особенности: ${s.outfit.features}`);

    if (outfit.length > 0) {
        prompt += `👔 {{user}} одета:\n`;
        prompt += outfit.join('\n');
        prompt += `\n\n`;
    }

    prompt += `⚠️ Описывай действия с учётом локации и одежды персонажей!]`;

    setExtensionPrompt(extensionName, prompt, extension_prompt_types.IN_CHAT, 0);
    console.log('[SceneOutfit] Промпт обновлён');
}

// ============================================
// UI СИНХРОНИЗАЦИЯ
// ============================================

function syncUI() {
    const s = getSettings();

    // Чекбокс
    const enabledCheck = $('#scene-outfit-enabled');
    if (enabledCheck.length) enabledCheck.prop('checked', s.isEnabled);

    // Сцена
    $('#scene-location-display').text(s.scene.location);
    $('#scene-user-pos-display').text(s.scene.userPosition);
    $('#scene-char-pos-display').text(s.scene.charPosition);

    // Аутфит
    $('#outfit-outer-display').text(s.outfit.outerWear || '—');
    $('#outfit-top-display').text(s.outfit.top || '—');
    $('#outfit-bottom-display').text(s.outfit.bottom || '—');
    $('#outfit-dress-display').text(s.outfit.dress || '—');
    $('#outfit-underwear-display').text(s.outfit.underwear || '—');
    $('#outfit-accessories-display').text(s.outfit.accessories || '—');
    $('#outfit-shoes-display').text(s.outfit.shoes || '—');
    $('#outfit-features-display').text(s.outfit.features || '—');
}

// ============================================
// РЕДАКТИРОВАНИЕ ПОЛЕЙ
// ============================================

function makeEditable(selector, settingPath) {
    $(document).on('click', selector, function() {
        const current = $(this).text().trim();
        const newValue = prompt('Введите новое значение:', current === '—' ? '' : current);

        if (newValue !== null) {
            const s = getSettings();
            const path = settingPath.split('.');

            if (path.length === 2) {
                s[path[0]][path[1]] = newValue;
            }

            saveSettingsDebounced();
            syncUI();
            updatePromptInjection();
        }
    });
}

// ============================================
// UI ГЕНЕРАЦИЯ
// ============================================

function setupUI() {
    const settingsHtml = `
<div class="scene-outfit-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>📍 Scene & Outfit Monitor</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label">
                <input type="checkbox" id="scene-outfit-enabled">
                <span>Включить мониторинг</span>
            </label>
            <hr>

            <!-- СЦЕНА -->
            <div class="scene-glass-panel">
                <div class="scene-section-title">📍 СЦЕНА</div>

                <div class="scene-info-row">
                    <span class="scene-label">📌 Локация:</span>
                    <span class="scene-value editable" id="scene-location-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">🧍 {{user}}:</span>
                    <span class="scene-value editable" id="scene-user-pos-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">🎭 {{char}}:</span>
                    <span class="scene-value editable" id="scene-char-pos-display">—</span>
                </div>
            </div>

            <!-- АУТФИТ -->
            <div class="outfit-glass-panel">
                <div class="scene-section-title">👔 АУТФИТ {{user}}</div>

                <div class="scene-info-row">
                    <span class="scene-label">🧥 Верхняя одежда:</span>
                    <span class="scene-value editable" id="outfit-outer-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">👕 Верх:</span>
                    <span class="scene-value editable" id="outfit-top-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">👖 Низ:</span>
                    <span class="scene-value editable" id="outfit-bottom-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">👗 Платье:</span>
                    <span class="scene-value editable" id="outfit-dress-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">🩲 Бельё:</span>
                    <span class="scene-value editable" id="outfit-underwear-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">💍 Аксессуары:</span>
                    <span class="scene-value editable" id="outfit-accessories-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">👟 Обувь:</span>
                    <span class="scene-value editable" id="outfit-shoes-display">—</span>
                </div>

                <div class="scene-info-row">
                    <span class="scene-label">✨ Особенности:</span>
                    <span class="scene-value editable" id="outfit-features-display">—</span>
                </div>
            </div>

            <small style="opacity: 0.5; margin-top: 10px; display: block;">
                💡 Кликни на любое поле чтобы изменить вручную
            </small>
        </div>
    </div>
</div>

<style>
.scene-outfit-settings .inline-drawer-content {
    padding: 10px;
}

.scene-glass-panel, .outfit-glass-panel {
    margin-top: 15px;
    padding: 15px;
    background: rgba(120, 160, 255, 0.08);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border: 1px solid rgba(120, 160, 255, 0.2);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(120, 160, 255, 0.15);
}

.outfit-glass-panel {
    background: rgba(255, 159, 243, 0.08);
    border-color: rgba(255, 159, 243, 0.2);
    box-shadow: 0 8px 32px rgba(255, 159, 243, 0.15);
}

.scene-section-title {
    font-size: 13px;
    font-weight: 600;
    color: #78a0ff;
    margin-bottom: 10px;
    letter-spacing: 0.5px;
}

.outfit-glass-panel .scene-section-title {
    color: #ff9ff3;
}

.scene-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.scene-info-row:last-child {
    border-bottom: none;
}

.scene-label {
    font-size: 12px;
    opacity: 0.7;
}

.scene-value {
    font-weight: 500;
    color: #78a0ff;
    font-size: 12px;
}

.outfit-glass-panel .scene-value {
    color: #ff9ff3;
}

.scene-value.editable {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s ease;
}

.scene-value.editable:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
}

hr {
    margin: 10px 0;
    border-color: var(--SmartThemeBorderColor);
    opacity: 0.3;
}
</style>
    `;

    $('#extensions_settings2').append(settingsHtml);

    // События
    $('#scene-outfit-enabled').on('change', function() {
        getSettings().isEnabled = this.checked;
        saveSettingsDebounced();
        updatePromptInjection();
    });

    // Делаем поля редактируемыми
    makeEditable('#scene-location-display', 'scene.location');
    makeEditable('#scene-user-pos-display', 'scene.userPosition');
    makeEditable('#scene-char-pos-display', 'scene.charPosition');
    makeEditable('#outfit-outer-display', 'outfit.outerWear');
    makeEditable('#outfit-top-display', 'outfit.top');
    makeEditable('#outfit-bottom-display', 'outfit.bottom');
    makeEditable('#outfit-dress-display', 'outfit.dress');
    makeEditable('#outfit-underwear-display', 'outfit.underwear');
    makeEditable('#outfit-accessories-display', 'outfit.accessories');
    makeEditable('#outfit-shoes-display', 'outfit.shoes');
    makeEditable('#outfit-features-display', 'outfit.features');

    syncUI();
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = structuredClone(defaultSettings);
    } else {
        // Merge с defaults
        for (const key in defaultSettings) {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        }
    }
    console.log('[SceneOutfit] Настройки загружены:', extension_settings[extensionName]);
}

jQuery(async () => {
    try {
        console.log('[SceneOutfit] Инициализация...');

        loadSettings();
        setupUI();
        updatePromptInjection();

        // Слушаем сообщения от AI
        eventSource.on(event_types.MESSAGE_RECEIVED, () => {
            const chat = window.chat || [];
            if (chat.length === 0) return;

            const lastMessage = chat[chat.length - 1];
            if (!lastMessage || lastMessage.is_user) return;

            console.log('[SceneOutfit] Парсинг сообщения...');
            parseAIMessage(lastMessage.mes);
        });

        // Обновляем промпт при отправке сообщения
        eventSource.on(event_types.MESSAGE_SENT, () => {
            updatePromptInjection();
        });

        console.log('[SceneOutfit] ✅ Расширение загружено');
    } catch (error) {
        console.error('[SceneOutfit] ОШИБКА:', error);
    }
});
