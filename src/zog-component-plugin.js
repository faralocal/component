export const ComponentPlugin = {
    install(api) {
        // تغییر ۱: reactive را از api اصلی دریافت می‌کنیم
        const { utils, addHook, watchEffect, reactive } = api;
        
        const componentRegistry = new Map();

        const registerComponent = (name, options) => {
            if (!options.template) return;
            componentRegistry.set(name.toLowerCase(), options);
        };

        addHook('beforeCompile', (el, scope, cs) => {
            if (el.nodeType !== 1) return;

            const tagName = el.tagName.toLowerCase();
            const componentName = tagName.startsWith('z-') ? tagName.slice(2) : tagName;

            if (componentRegistry.has(componentName)) {
                console.log(`[Plugin] Replacing <${tagName}> with component...`);
                
                const def = componentRegistry.get(componentName);
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = def.template.trim();
                const componentRoot = tempContainer.firstElementChild;

                if (!componentRoot) return false;

                // تغییر ۲: استفاده از reactive (بدون utils)
                const childData = reactive({});
                const parentListeners = {};

                // پردازش ویژگی‌ها
                Array.from(el.attributes).forEach(attr => {
                    const { name, value } = attr;
                    if (name.startsWith(':')) {
                        const propName = name.slice(1);
                        cs.addEffect(watchEffect(() => {
                            childData[propName] = utils.evalExp(value, scope);
                        }));
                    } else if (name.startsWith('@')) {
                        parentListeners[name.slice(1)] = value;
                    } else if (name === 'class') {
                        componentRoot.classList.add(...value.split(' '));
                    } else if (name === 'style') {
                        componentRoot.style.cssText += ';' + value;
                    } else {
                        childData[name] = value;
                    }
                });

                // Emit
                childData.emit = (eventName, ...args) => {
                    const handlerCode = parentListeners[eventName];
                    if (!handlerCode) return;
                    if (typeof scope[handlerCode] === 'function') {
                        scope[handlerCode](...args);
                    } else {
                        try {
                            new Function(...Object.keys(scope), '$event', `"use strict";${handlerCode}`)
                                (...Object.values(scope), args[0]);
                        } catch(e) { console.error(e); }
                    }
                };

                // Slots
                const slot = componentRoot.querySelector('slot');
                if (slot) {
                    while (el.childNodes.length > 0) {
                        const child = el.childNodes[0];
                        utils.compile(child, scope, cs);
                        slot.parentNode.insertBefore(child, slot);
                    }
                    slot.remove();
                }

                // Replace & Compile
                el.replaceWith(componentRoot);
                const componentScope = new utils.Scope(childData);
                utils.compile(componentRoot, childData, componentScope);

                return false;
            }
            return true;
        });

        return { registerComponent };
    }
};
