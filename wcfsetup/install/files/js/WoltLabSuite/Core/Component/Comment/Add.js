/**
 * Handles the add comment feature in the comment list.
 *
 * @author Marcel Werk
 * @copyright 2001-2023 WoltLab GmbH
 * @license GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 * @since 6.0
 */
define(["require", "exports", "tslib", "../../Ajax", "../../Ui/Scroll", "../../Ui/Notification", "../../Language", "../../Event/Handler", "../../Dom/Util", "./GuestDialog", "../../Core", "../Ckeditor", "../Ckeditor/Event"], function (require, exports, tslib_1, Ajax_1, UiScroll, UiNotification, Language_1, EventHandler, Util_1, GuestDialog_1, Core, Ckeditor_1, Event_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CommentAdd = void 0;
    UiScroll = tslib_1.__importStar(UiScroll);
    UiNotification = tslib_1.__importStar(UiNotification);
    EventHandler = tslib_1.__importStar(EventHandler);
    Util_1 = tslib_1.__importDefault(Util_1);
    Core = tslib_1.__importStar(Core);
    class CommentAdd {
        #container;
        #content;
        #editorContainer;
        #textarea;
        #objectTypeId;
        #objectId;
        #placeholder;
        #callback;
        #editor;
        constructor(container, objectTypeId, objectId, callback) {
            this.#container = container;
            this.#content = this.#container.querySelector(".commentAdd__content");
            this.#editorContainer = this.#container.querySelector(".commentAdd__editor");
            this.#textarea = this.#container.querySelector(".wysiwygTextarea");
            this.#objectTypeId = objectTypeId;
            this.#objectId = objectId;
            this.#placeholder = this.#container.querySelector(".commentAdd__placeholder");
            this.#callback = callback;
            this.#initEvents();
        }
        #initEvents() {
            this.#placeholder.addEventListener("click", (event) => {
                if (this.#content.classList.contains("commentAdd__content--collapsed")) {
                    event.preventDefault();
                    this.#content.classList.remove("commentAdd__content--collapsed");
                    this.#container.classList.remove("commentAdd--collapsed");
                    this.#placeholder.hidden = true;
                    this.#editorContainer.hidden = false;
                    this.#focusEditor();
                }
            });
            const submitButton = this.#container.querySelector('button[data-type="save"]');
            submitButton.addEventListener("click", (event) => {
                event.preventDefault();
                void this.#submit();
            });
            (0, Event_1.listenToCkeditor)(this.#textarea).setupFeatures(({ features }) => {
                features.heading = false;
                features.quoteBlock = false;
                features.spoiler = false;
                features.table = false;
            });
        }
        /**
         * Scrolls the editor into view and sets the caret to the end of the editor.
         */
        #focusEditor() {
            window.setTimeout(() => {
                UiScroll.element(this.#container, () => {
                    this.#getEditor().focus();
                });
            }, 0);
        }
        /**
         * Validates the message and invokes listeners to perform additional validation.
         */
        #validate() {
            // remove all existing error elements
            this.#container.querySelectorAll(".innerError").forEach((el) => el.remove());
            const message = this.#getEditor().getHtml();
            if (message === "") {
                this.#throwError(this.#getEditor().element, (0, Language_1.getPhrase)("wcf.global.form.error.empty"));
                return false;
            }
            const data = {
                api: this,
                editor: this.#getEditor(),
                message,
                valid: true,
            };
            EventHandler.fire("com.woltlab.wcf.ckeditor5", "validate_text", data);
            return data.valid;
        }
        /**
         * Validates the message and submits it to the server.
         */
        async #submit(additionalParameters = {}) {
            if (!this.#validate()) {
                return;
            }
            this.#showLoadingOverlay();
            const parameters = this.#getParameters();
            EventHandler.fire("com.woltlab.wcf.ckeditor5", "submit_text", parameters.data);
            let response;
            try {
                response = (await (0, Ajax_1.dboAction)("addComment", "wcf\\data\\comment\\CommentAction")
                    .payload(Core.extend(parameters, additionalParameters))
                    .disableLoadingIndicator()
                    .dispatch());
            }
            catch (error) {
                await (0, Ajax_1.handleValidationErrors)(error, (returnValues) => {
                    this.#throwError(this.#getEditor().element, returnValues.errorType);
                    this.#hideLoadingOverlay();
                    return true;
                });
                return;
            }
            if (response.guestDialog) {
                const additionalParameters = await (0, GuestDialog_1.showGuestDialog)(response.guestDialog);
                if (additionalParameters === undefined) {
                    this.#hideLoadingOverlay();
                }
                else {
                    void this.#submit(additionalParameters);
                }
                return;
            }
            this.#callback(response.template);
            UiNotification.show((0, Language_1.getPhrase)("wcf.global.success.add"));
            this.#reset();
            this.#hideLoadingOverlay();
        }
        /**
         * Returns the current editor instance.
         */
        #getEditor() {
            if (this.#editor === undefined) {
                this.#editor = (0, Ckeditor_1.getCkeditor)(this.#textarea);
            }
            return this.#editor;
        }
        /**
         * Displays a loading spinner while the request is processed by the server.
         */
        #showLoadingOverlay() {
            if (this.#content.classList.contains("commentAdd__content--loading")) {
                return;
            }
            const loadingOverlay = document.createElement("div");
            loadingOverlay.className = "commentAdd__loading";
            loadingOverlay.innerHTML = '<woltlab-core-loading-indicator size="96" hide-text></woltlab-core-loading-indicator>';
            this.#content.classList.add("commentAdd__content--loading");
            this.#content.appendChild(loadingOverlay);
        }
        /**
         * Throws an error by adding an inline error to target element.
         */
        #throwError(element, message) {
            Util_1.default.innerError(element, message === "empty" ? (0, Language_1.getPhrase)("wcf.global.form.error.empty") : message);
        }
        /**
         * Returns the request parameters to add a comment.
         */
        #getParameters() {
            return {
                data: {
                    message: this.#getEditor().getHtml(),
                    objectID: this.#objectId,
                    objectTypeID: this.#objectTypeId,
                },
            };
        }
        /**
         * Resets the editor contents and notifies event listeners.
         */
        #reset() {
            this.#getEditor().reset();
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            this.#content.classList.add("commentAdd__content--collapsed");
            this.#container.classList.add("commentAdd--collapsed");
            this.#editorContainer.hidden = true;
            this.#placeholder.hidden = false;
        }
        /**
         * Hides the loading spinner.
         */
        #hideLoadingOverlay() {
            this.#content.classList.remove("commentAdd__content--loading");
            const loadingOverlay = this.#content.querySelector(".commentAdd__loading");
            if (loadingOverlay !== null) {
                loadingOverlay.remove();
            }
        }
    }
    exports.CommentAdd = CommentAdd;
});
